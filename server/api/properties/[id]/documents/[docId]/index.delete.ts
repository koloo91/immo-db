import { getDatabase, schema } from '../../../../../database'
import { eq, and } from 'drizzle-orm'
import { removeDocs, pageDocId } from '../../../../../utils/search'
import { unlinkSync, existsSync } from 'node:fs'
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

  if (doc) {
    const absolutePath = join(process.cwd(), doc.filePath)
    if (existsSync(absolutePath)) {
      try {
        unlinkSync(absolutePath)
      } catch (e) {
        console.warn('Could not delete file from disk:', e)
      }
    }

    await db.delete(schema.documents).where(eq(schema.documents.id, docId))

    // Alle Seiten dieses Dokuments aus dem Index nehmen (Seite 0 = Scan-Fallback).
    const ids = Array.from({ length: (doc.pageCount || 0) + 1 }, (_, i) => pageDocId(docId, i))
    await removeDocs(ids).catch(err => console.warn('[Suche] Index-Update:', err.message))
  }

  return { success: true }
})
