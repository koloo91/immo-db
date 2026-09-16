import { inArray, or, eq, isNotNull, lt, isNull, and } from 'drizzle-orm'
import { getDatabase, schema } from '../database'
import { createDocumentWorker, enqueueDocument, closeQueue, createListingWorker, enqueueListingCheck, scheduleDailyListingCheck } from '../utils/queue'
import { processDocument } from '../jobs/processDocument'
import { checkListing } from '../jobs/checkListing'
import { reindexAll } from '../utils/search'

/**
 * Startet den BullMQ-Worker im Nitro-Prozess und räumt beim Hochfahren auf:
 *   - hängengebliebene Dokumente erneut einreihen
 *   - den Suchindex komplett neu aufbauen
 *
 * Beides ist bewusst beim Start und nicht periodisch: bei dieser Datenmenge dauert
 * es Sekunden und macht Index-Drift unmöglich, auch wenn Meilisearch tagelang aus war.
 *
 * Fehlen Redis oder Meilisearch, wird einmal gewarnt und die App läuft normal weiter.
 */
export default defineNitroPlugin(async (nitroApp) => {
  const worker = createDocumentWorker(async (job) => processDocument(job.data.documentId))

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} fehlgeschlagen (Versuch ${job?.attemptsMade}): ${err.message}`)
  })
  worker.on('completed', (job, result: any) => {
    const pages = result?.pages ?? 0
    console.log(`[Worker] Dokument ${result?.documentId} verarbeitet (${pages} Seite(n) Text).`)
  })

  const listingWorker = createListingWorker(async (job) => runListingCheck(job.data))

  listingWorker.on('failed', (job, err) => {
    console.error(`[Inserate] Lauf fehlgeschlagen: ${err.message}`)
  })

  nitroApp.hooks.hook('close', async () => {
    await worker.close().catch(() => {})
    await listingWorker.close().catch(() => {})
    await closeQueue()
  })

  // Nicht blockieren - der Server soll sofort Requests annehmen.
  void recoverStuckDocuments()
  void initialReindex()
  void setUpListingChecks()
})

/**
 * Prüft die Inserate der übergebenen (oder aller) Grundstücke nacheinander,
 * mit Abstand dazwischen. Nebenläufigkeit 1 in der Queue plus diese Pause halten
 * das Anfragevolumen gegenüber den Portalen niedrig.
 */
async function runListingCheck(job: { scheduled: boolean, propertyIds?: string[] }) {
  const db = getDatabase()

  const ids = job.propertyIds?.length
    ? job.propertyIds
    : (await db.query.properties.findMany({
        where: isNotNull(schema.properties.adUrl),
        columns: { id: true }
      })).map(p => p.id)

  const summary = { online: 0, offline: 0, suspect: 0, unverifiable: 0, priceChanges: 0 }

  for (const [index, id] of ids.entries()) {
    if (index > 0) await new Promise(resolve => setTimeout(resolve, 4000))
    try {
      const result = await checkListing(id, { scheduled: job.scheduled })
      summary[result.state]++
      if (result.priceChanged) summary.priceChanges++
    } catch (err: any) {
      console.warn(`[Inserate] ${id}: ${err.message}`)
    }
  }

  console.log(
    `[Inserate] ${ids.length} geprüft - ${summary.online} online, ${summary.offline} offline, ` +
    `${summary.suspect} auffällig, ${summary.unverifiable} nicht prüfbar, ${summary.priceChanges} Preisänderung(en).`
  )
  return summary
}

/**
 * Tageslauf einplanen und alles nachholen, was zu lange nicht geprüft wurde.
 *
 * Das Nachholen ist der entscheidende Teil: Das Werkzeug läuft lokal und nicht rund um die Uhr -
 * ein reiner Zeitplan würde meistens gar nicht feuern, und "täglich" wäre eine Behauptung.
 */
const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000

async function setUpListingChecks() {
  try {
    await scheduleDailyListingCheck()

    const db = getDatabase()
    const candidates = await db.query.properties.findMany({
      where: isNotNull(schema.properties.adUrl),
      columns: { id: true },
      with: { listingStatus: { columns: { lastCheckedAt: true } } }
    })

    const cutoff = Date.now() - RECHECK_AFTER_MS
    const due = candidates
      .filter(p => {
        const last = (p as any).listingStatus?.lastCheckedAt
        return !last || last < cutoff
      })
      .map(p => p.id)

    if (due.length > 0) {
      await enqueueListingCheck({ scheduled: true, propertyIds: due })
      console.log(`[Inserate] ${due.length} überfällige Prüfung(en) nachgeholt.`)
    }
  } catch (err: any) {
    console.warn(`[Inserate] Einrichtung fehlgeschlagen: ${err.message}`)
  }
}

/**
 * Dokumente, die beim letzten Absturz mitten in der Verarbeitung standen, wieder anstoßen.
 * 'running' ist hier der entscheidende Fall: dieser Zustand konnte sich früher nie
 * von selbst auflösen und ließ die Oberfläche endlos pollen.
 */
async function recoverStuckDocuments() {
  try {
    const db = getDatabase()
    const stuck = await db.query.documents.findMany({
      where: or(
        inArray(schema.documents.analysisStatus, ['pending', 'running']),
        eq(schema.documents.textStatus, 'pending')
      ),
      columns: { id: true, fileName: true }
    })

    if (stuck.length === 0) return

    let queued = 0
    for (const doc of stuck) {
      if (await enqueueDocument(doc.id)) queued++
    }

    if (queued > 0) {
      console.log(`[Worker] ${queued} unterbrochene(s) Dokument(e) erneut eingereiht.`)
    }
  } catch (err: any) {
    console.warn(`[Worker] Wiederaufnahme fehlgeschlagen: ${err.message}`)
  }
}

async function initialReindex() {
  try {
    const result = await reindexAll()
    const detail = Object.entries(result.byType).map(([type, n]) => `${n} ${type}`).join(', ')
    console.log(`[Suche] Index neu aufgebaut: ${result.indexed} Einträge${detail ? ` (${detail})` : ''}.`)
  } catch (err: any) {
    console.warn(`[Suche] Index konnte beim Start nicht aufgebaut werden: ${err.message}`)
  }
}
