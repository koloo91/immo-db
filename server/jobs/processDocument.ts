import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../database'
import { extractPdfPages } from '../utils/pdfText'
import { analyzeDocumentWithGemini } from '../utils/gemini'
import { documentPageDocs, documentFallbackDoc, indexDocs, removeDocs, pageDocId } from '../utils/search'

/**
 * Verarbeitet ein hochgeladenes Dokument in drei Schritten:
 *   1. Volltext seitenweise extrahieren
 *   2. Gemini-Analyse
 *   3. In den Suchindex schreiben
 *
 * Läuft als BullMQ-Job, damit ein Prozessabsturz zwischen den Schritten nicht
 * dazu führt, dass das Dokument dauerhaft auf "running" hängenbleibt - genau das
 * passierte mit dem früheren Fire-and-Forget-Aufruf bei jedem HMR-Reload.
 *
 * Schritt 2 darf scheitern, ohne Schritt 1 und 3 zu entwerten: der Text ist dann
 * trotzdem durchsuchbar. Nur ein Fehler in Schritt 1 lässt den Job fehlschlagen
 * und BullMQ erneut versuchen.
 */
export async function processDocument(documentId: string) {
  const db = getDatabase()

  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, documentId),
    with: { property: true }
  })

  if (!doc) {
    console.warn(`[Job] Dokument ${documentId} existiert nicht mehr - übersprungen.`)
    return { skipped: true }
  }

  const absolutePath = join(process.cwd(), doc.filePath)
  if (!existsSync(absolutePath)) {
    await db.update(schema.documents)
      .set({ textStatus: 'error', analysisStatus: 'error', analysisError: 'Datei auf dem Datenträger nicht gefunden' })
      .where(eq(schema.documents.id, documentId))
    return { skipped: true, reason: 'file-missing' }
  }

  const buffer = readFileSync(absolutePath)
  const isPdf = doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf')
  const propertyTitle = (doc as any).property?.title || ''

  // --- Schritt 1: Volltext -------------------------------------------------
  let pages: Array<{ pageNumber: number, text: string }> = []

  if (!isPdf) {
    await db.update(schema.documents)
      .set({ textStatus: 'skipped', analysisStatus: 'skipped' })
      .where(eq(schema.documents.id, documentId))
  } else {
    const extracted = await extractPdfPages(buffer)

    // Alte Seiten weg, bevor neue kommen (z. B. bei erneutem Lauf nach Kategoriewechsel).
    await db.delete(schema.documentPages).where(eq(schema.documentPages.documentId, documentId))

    const now = Date.now()
    pages = extracted.pages
      .map((text, i) => ({ pageNumber: i + 1, text }))
      .filter(page => page.text.length > 0)

    if (pages.length > 0) {
      await db.insert(schema.documentPages).values(pages.map(page => ({
        id: 'pg-' + randomUUID().slice(0, 8),
        documentId,
        propertyId: doc.propertyId,
        pageNumber: page.pageNumber,
        text: page.text,
        createdAt: now
      })))
    }

    await db.update(schema.documents).set({
      pageCount: extracted.pageCount,
      hasTextLayer: extracted.hasTextLayer ? 1 : 0,
      textStatus: extracted.hasTextLayer ? 'done' : 'none',
      textExtractedAt: now
    }).where(eq(schema.documents.id, documentId))
  }

  // --- Schritt 2: KI-Analyse ----------------------------------------------
  let analysisFailed: string | null = null

  if (isPdf) {
    try {
      await db.update(schema.documents)
        .set({ analysisStatus: 'running', analysisError: null })
        .where(eq(schema.documents.id, documentId))

      const analysis = await analyzeDocumentWithGemini(buffer, doc.fileName, doc.docType)

      await db.update(schema.documents).set({
        aiSummary: analysis.summary || '',
        aiExtractedDataJson: JSON.stringify(analysis.extracted || {}),
        aiRiskAssessmentJson: JSON.stringify(analysis.riskAssessment || {}),
        analysisStatus: 'done',
        analysisError: null,
        analyzedAt: Date.now()
      }).where(eq(schema.documents.id, documentId))
    } catch (err: any) {
      analysisFailed = err.message || String(err)
      console.error(`[Job] Analyse für ${documentId} fehlgeschlagen:`, analysisFailed)
      await db.update(schema.documents)
        .set({ analysisStatus: 'error', analysisError: analysisFailed })
        .where(eq(schema.documents.id, documentId))
    }
  }

  // --- Schritt 3: Suchindex ------------------------------------------------
  try {
    const fresh = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) })
    if (fresh) {
      // Frühere Einträge dieses Dokuments entfernen, sonst bleiben Seiten eines
      // vorherigen Laufs als Karteileichen im Index.
      const stale = Array.from({ length: (fresh.pageCount || 0) + 1 }, (_, i) => pageDocId(documentId, i))
      await removeDocs(stale)

      if (pages.length > 0) {
        await indexDocs(documentPageDocs(fresh, pages, propertyTitle))
      } else if (fresh.aiSummary) {
        await indexDocs([documentFallbackDoc(fresh, propertyTitle)])
      }
    }
  } catch (err: any) {
    // Der Index ist nachrangig: die Daten stehen in der DB und der Start-Reindex
    // holt sie nach. Den Job deswegen nicht fehlschlagen lassen.
    console.warn(`[Job] Indexierung für ${documentId} fehlgeschlagen: ${err.message}`)
  }

  return {
    documentId,
    pages: pages.length,
    hasTextLayer: pages.length > 0,
    analysisFailed
  }
}
