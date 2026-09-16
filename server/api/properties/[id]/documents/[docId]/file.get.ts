import { getDatabase, schema } from '../../../../../database'
import { eq, and } from 'drizzle-orm'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

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
    throw createError({ statusCode: 404, statusMessage: 'PDF-Datei nicht gefunden' })
  }

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    'Content-Length': String(doc.fileSize)
  })

  return sendStream(event, createReadStream(absolutePath))
})
