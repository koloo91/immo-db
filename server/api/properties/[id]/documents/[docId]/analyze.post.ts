import { and, eq } from 'drizzle-orm'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase, schema } from '../../../../../database'
import { runDocumentAnalysis } from '../../../../../utils/documentStore'

/** Startet die Analyse eines Dokuments neu - auch als "Erneut versuchen" nach einem Fehler. */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')
  if (!propertyId || !docId) {
    throw createError({ statusCode: 400, statusMessage: 'IDs erforderlich' })
  }

  const db = getDatabase()
  const doc = await db.query.documents.findFirst({
    where: and(
      eq(schema.documents.id, docId),
      eq(schema.documents.propertyId, propertyId)
    )
  })

  if (!doc) {
    throw createError({ statusCode: 404, statusMessage: 'Dokument nicht gefunden' })
  }

  const absolutePath = join(process.cwd(), doc.filePath)
  if (!existsSync(absolutePath)) {
    throw createError({ statusCode: 404, statusMessage: 'PDF-Datei auf Datenträger nicht gefunden' })
  }

  const result = await runDocumentAnalysis(docId, readFileSync(absolutePath), doc.fileName, doc.docType)

  if (!result.ok) {
    throw createError({ statusCode: 502, statusMessage: result.error })
  }

  return {
    id: docId,
    analysisStatus: 'done',
    aiSummary: result.analysis.summary,
    aiExtractedData: result.analysis.extracted,
    aiRiskAssessment: result.analysis.riskAssessment
  }
})
