import { and, eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase, schema } from '../../../../../database'
import { enqueueDocument } from '../../../../../utils/queue'

const VALID_DOC_TYPES = ['expose', 'bplan', 'kataster', 'grundbuch', 'altlasten', 'sonstiges']

/**
 * Ändert die Kategorie eines Dokuments. Da jede Kategorie einen eigenen Analyse-Prompt
 * hat, wird die Analyse danach mit dem passenden Prompt neu angestoßen.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')
  if (!propertyId || !docId) {
    throw createError({ statusCode: 400, statusMessage: 'IDs erforderlich' })
  }

  const body = await readBody(event)
  const docType = body?.docType

  if (!VALID_DOC_TYPES.includes(docType)) {
    throw createError({ statusCode: 400, statusMessage: `Unbekannte Kategorie: ${docType}` })
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

  if (doc.docType === docType) {
    return { id: docId, docType, reanalyzed: false }
  }

  await db.update(schema.documents)
    .set({ docType, analysisStatus: 'pending', analysisError: null, textStatus: 'pending' })
    .where(eq(schema.documents.id, docId))

  const absolutePath = join(process.cwd(), doc.filePath)
  const analysable = existsSync(absolutePath)
    && (doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf'))

  if (analysable) {
    // Über die Queue, damit Textextraktion und Indexierung mitlaufen und der Job
    // einen Serverneustart übersteht.
    await enqueueDocument(docId)
  } else {
    await db.update(schema.documents)
      .set({ analysisStatus: 'skipped' })
      .where(eq(schema.documents.id, docId))
  }

  return { id: docId, docType, reanalyzed: analysable }
})
