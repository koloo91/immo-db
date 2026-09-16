// Seit meilisearch 0.62 heißt der Export 'Meilisearch' (kleines s), nicht mehr 'MeiliSearch'.
import { Meilisearch, type Index } from 'meilisearch'
import { eq, desc } from 'drizzle-orm'
import { getDatabase, schema } from '../database'

export const SEARCH_INDEX = 'immo'

export type SearchDocType = 'property' | 'document_page' | 'email' | 'analysis'

/**
 * Meilisearch lässt in Dokument-IDs nur a-z A-Z 0-9, Bindestrich und Unterstrich zu -
 * ein Doppelpunkt als Trenner führt dazu, dass der gesamte Schreibvorgang abgelehnt wird.
 * Deshalb hier zentral gebaut, damit Schreib- und Löschpfad nicht auseinanderlaufen.
 */
export const propertyDocId = (propertyId: string) => `prop_${propertyId}`
export const pageDocId = (documentId: string, pageNumber: number) => `page_${documentId}_${pageNumber}`
export const emailDocId = (commId: string) => `mail_${commId}`
export const analysisDocId = (analysisId: string) => `analysis_${analysisId}`

export interface SearchDoc {
  id: string
  type: SearchDocType
  propertyId: string
  propertyTitle: string
  title: string
  text: string
  pageNumber?: number
  docId?: string
  threadId?: string
  occurredAt: number
}


/**
 * Meilisearch kann Tippfehler und Wortanfänge, aber kein deutsches Stemming:
 * "Erschließung" findet "voll erschlossen" nicht, weil das eine Ableitung ist und
 * keine Verwechslung. Gemessen an echten Daten dieses Projekts.
 *
 * Diese Paare schließen die Lücke für die Begriffe, um die es in Grundstücksakten
 * tatsächlich geht. Jedes Paar wird in beide Richtungen eingetragen.
 */
const SYNONYM_GROUPS: string[][] = [
  ['erschließung', 'erschliessung', 'erschlossen', 'erschließungsgrad'],
  ['erschließungsbeitrag', 'erschliessungsbeitrag', 'erschließungskosten', 'kag-beitrag'],
  ['bebauungsplan', 'b-plan', 'bplan', 'bebauungsplänen'],
  ['grundbuch', 'grundbuchauszug', 'grundbuchblatt'],
  ['grz', 'grundflächenzahl', 'grundflaechenzahl'],
  ['gfz', 'geschossflächenzahl', 'geschossflaechenzahl'],
  ['bodenrichtwert', 'boris', 'richtwert'],
  ['altlasten', 'altlast', 'altlastenverdacht', 'altlastenkataster'],
  ['kampfmittel', 'kampfmittelverdacht', 'kampfmittelfreiheit'],
  ['flurstück', 'flurstueck', 'parzelle', 'flurstücke'],
  ['kataster', 'liegenschaftskataster', 'katasteramt', 'katasterbehörde'],
  ['makler', 'maklerin', 'maklerbüro', 'immobilienmakler'],
  ['baulast', 'baulasten', 'baulastenverzeichnis'],
  ['wegerecht', 'wegerechte', 'geh- und fahrtrecht'],
  ['dienstbarkeit', 'dienstbarkeiten', 'grunddienstbarkeit'],
  ['besichtigung', 'besichtigungstermin', 'ortstermin'],
  ['kaufpreis', 'preis', 'kaufsumme'],
  ['exposé', 'expose', 'inserat', 'anzeige']
]

function buildSynonyms(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      map[term] = group.filter(other => other !== term)
    }
  }
  return map
}

let client: Meilisearch | null = null

export function getSearchClient(): Meilisearch {
  if (!client) {
    const config = useRuntimeConfig()
    client = new Meilisearch({
      host: config.meilisearchUrl as string,
      apiKey: config.meilisearchKey as string,
      timeout: 5000
    })
  }
  return client
}

export async function isSearchAvailable(): Promise<{ online: boolean, message: string, version?: string }> {
  const config = useRuntimeConfig()
  try {
    const version = await getSearchClient().getVersion()
    return { online: true, version: version.pkgVersion, message: 'Meilisearch ist erreichbar.' }
  } catch (err: any) {
    return {
      online: false,
      message: `Meilisearch nicht erreichbar unter ${config.meilisearchUrl}: ${err.message}`
    }
  }
}

/** Legt den Index an (falls nötig) und setzt die Suchkonfiguration. */
export async function ensureIndex(): Promise<Index<SearchDoc>> {
  const meili = getSearchClient()

  try {
    await meili.getIndex(SEARCH_INDEX)
  } catch {
    await meili.createIndex(SEARCH_INDEX, { primaryKey: 'id' })
  }

  const index = meili.index<SearchDoc>(SEARCH_INDEX)

  await index.updateSettings({
    // Reihenfolge = Gewichtung: ein Treffer im Titel zählt mehr als einer im Fließtext.
    searchableAttributes: ['title', 'propertyTitle', 'text'],
    filterableAttributes: ['type', 'propertyId'],
    sortableAttributes: ['occurredAt'],
    // Deutsche Behördenwörter sind lang; Tippfehlertoleranz erst ab brauchbarer Wortlänge,
    // damit "GRZ" und "Flur" nicht gegen alles Mögliche matchen.
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 6, twoTypos: 10 }
    },
    synonyms: buildSynonyms()
  })

  return index
}

/**
 * Meilisearch verarbeitet Schreibvorgänge asynchron als Task. Ohne Warten auf das
 * Ergebnis meldet der Aufrufer Erfolg, obwohl der Task fehlgeschlagen sein kann -
 * genau so blieb der Index anfangs leer, während das Log "9 Einträge" behauptete.
 */
export async function indexDocs(docs: SearchDoc[]): Promise<number> {
  if (docs.length === 0) return 0
  const index = await ensureIndex()
  const enqueued = await index.addDocuments(docs)
  const task = await getSearchClient().tasks.waitForTask(enqueued.taskUid)

  if (task.status !== 'succeeded') {
    throw new Error(`Indexierung fehlgeschlagen: ${task.error?.message || task.status}`)
  }
  return docs.length
}

export async function removeDocs(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const index = await ensureIndex()
  await index.deleteDocuments(ids)
}

/** Entfernt alles, was zu einem Grundstück gehört - z. B. wenn es gelöscht wird. */
export async function removePropertyFromIndex(propertyId: string): Promise<void> {
  const index = await ensureIndex()
  await index.deleteDocuments({ filter: `propertyId = "${propertyId}"` })
}

// ---------------------------------------------------------------------------
// Aus den Datenbankzeilen Index-Dokumente bauen
// ---------------------------------------------------------------------------

export function propertyDoc(property: any): SearchDoc {
  const parts = [
    property.address,
    property.notes,
    property.buildingLaw,
    property.developmentStatus,
    property.parcel?.flstkennz,
    property.parcel?.gemarkungName,
    // Sprechende Katasterangaben mitnehmen - "Baureifes Land" oder "Wohnbaufläche"
    // sind Begriffe, nach denen man tatsächlich sucht.
    property.parcel?.borisEntwicklungszustand,
    property.parcel?.borisNutzung,
    property.parcel?.borisBodenrichtwert ? `Bodenrichtwert ${property.parcel.borisBodenrichtwert} €/m²` : null,
    property.broker?.name,
    property.broker?.company,
    property.broker?.email
  ].filter(Boolean)

  return {
    id: propertyDocId(property.id),
    type: 'property',
    propertyId: property.id,
    propertyTitle: property.title,
    title: property.title,
    text: parts.join('\n'),
    occurredAt: property.updatedAt || property.createdAt || Date.now()
  }
}

export function documentPageDocs(document: any, pages: Array<{ pageNumber: number, text: string }>, propertyTitle: string): SearchDoc[] {
  return pages.map(page => ({
    id: pageDocId(document.id, page.pageNumber),
    type: 'document_page' as const,
    propertyId: document.propertyId,
    propertyTitle,
    title: document.fileName,
    text: page.text,
    pageNumber: page.pageNumber,
    docId: document.id,
    occurredAt: document.createdAt
  }))
}

/**
 * Für Dokumente ohne Textebene (Scans): statt der Seiten das indexieren, was ohnehin
 * vorliegt - KI-Zusammenfassung, erkannte Kennzahlen und Risiken. Das Dokument bleibt
 * damit auffindbar, nur eben nicht in der Tiefe.
 */
export function documentFallbackDoc(document: any, propertyTitle: string): SearchDoc {
  const parts: string[] = [document.aiSummary || '']

  for (const field of ['aiExtractedDataJson', 'aiRiskAssessmentJson'] as const) {
    try {
      const parsed = document[field] ? JSON.parse(document[field]) : null
      if (parsed) parts.push(flattenJson(parsed))
    } catch {}
  }

  return {
    id: pageDocId(document.id, 0),
    type: 'document_page',
    propertyId: document.propertyId,
    propertyTitle,
    title: document.fileName,
    text: parts.filter(Boolean).join('\n'),
    docId: document.id,
    occurredAt: document.createdAt
  }
}

export function emailDoc(comm: any, propertyTitle: string): SearchDoc {
  return {
    id: emailDocId(comm.id),
    type: 'email',
    propertyId: comm.propertyId,
    propertyTitle,
    title: comm.subject || comm.summary,
    text: [comm.summary, comm.bodyText, comm.details, comm.fromAddress, comm.toAddress]
      .filter(Boolean).join('\n'),
    threadId: comm.threadId || undefined,
    occurredAt: comm.occurredAt || comm.createdAt
  }
}

export function analysisDoc(analysis: any, propertyTitle: string): SearchDoc {
  const parts: string[] = [analysis.summary || '', analysis.verdict || '']
  for (const field of ['risksJson', 'opportunitiesJson', 'openQuestionsJson', 'priceAssessmentJson'] as const) {
    try {
      const parsed = analysis[field] ? JSON.parse(analysis[field]) : null
      if (parsed) parts.push(flattenJson(parsed))
    } catch {}
  }

  return {
    id: analysisDocId(analysis.id),
    type: 'analysis',
    propertyId: analysis.propertyId,
    propertyTitle,
    title: `KI-Gesamtanalyse${analysis.scoreOverall !== null ? ` (Score ${analysis.scoreOverall})` : ''}`,
    text: parts.filter(Boolean).join('\n'),
    occurredAt: analysis.createdAt
  }
}

/** Zieht alle Strings aus einer beliebig verschachtelten JSON-Struktur zusammen. */
function flattenJson(value: any): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(flattenJson).filter(Boolean).join('\n')
  if (value && typeof value === 'object') {
    return Object.values(value).map(flattenJson).filter(Boolean).join(' ')
  }
  return ''
}

// ---------------------------------------------------------------------------
// Voller Neuaufbau - das Sicherheitsnetz gegen Index-Drift
// ---------------------------------------------------------------------------

export async function reindexAll(): Promise<{ indexed: number, byType: Record<string, number> }> {
  const db = getDatabase()
  const index = await ensureIndex()

  const properties = await db.query.properties.findMany({
    with: {
      parcel: true,
      broker: true,
      documents: { with: { pages: true } },
      communications: true,
      analyses: { orderBy: [desc(schema.propertyAnalyses.createdAt)] }
    }
  })

  const docs: SearchDoc[] = []

  for (const property of properties) {
    docs.push(propertyDoc(property))

    for (const document of property.documents) {
      const pages = (document as any).pages || []
      if (pages.length > 0) {
        docs.push(...documentPageDocs(document, pages, property.title))
      } else if (document.aiSummary) {
        docs.push(documentFallbackDoc(document, property.title))
      }
    }

    for (const comm of property.communications) {
      if (comm.state === 'draft') continue
      docs.push(emailDoc(comm, property.title))
    }

    for (const analysis of (property as any).analyses || []) {
      docs.push(analysisDoc(analysis, property.title))
    }
  }

  // Erst leeren, dann neu befüllen - so verschwinden auch Einträge,
  // deren Quellzeile inzwischen gelöscht wurde.
  const cleared = await index.deleteAllDocuments()
  await getSearchClient().tasks.waitForTask(cleared.taskUid)
  if (docs.length > 0) await indexDocs(docs)

  const byType: Record<string, number> = {}
  for (const doc of docs) byType[doc.type] = (byType[doc.type] || 0) + 1

  return { indexed: docs.length, byType }
}

/** Indexiert ein einzelnes Grundstück samt allem, was daran hängt. */
export async function reindexProperty(propertyId: string): Promise<number> {
  const db = getDatabase()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: {
      parcel: true,
      broker: true,
      documents: { with: { pages: true } },
      communications: true,
      analyses: true
    }
  })
  if (!property) return 0

  await removePropertyFromIndex(propertyId)

  const docs: SearchDoc[] = [propertyDoc(property)]

  for (const document of property.documents) {
    const pages = (document as any).pages || []
    if (pages.length > 0) docs.push(...documentPageDocs(document, pages, property.title))
    else if (document.aiSummary) docs.push(documentFallbackDoc(document, property.title))
  }
  for (const comm of property.communications) {
    if (comm.state === 'draft') continue
    docs.push(emailDoc(comm, property.title))
  }
  for (const analysis of (property as any).analyses || []) {
    docs.push(analysisDoc(analysis, property.title))
  }

  await indexDocs(docs)
  return docs.length
}
