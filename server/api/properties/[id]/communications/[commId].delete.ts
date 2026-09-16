import { getDatabase, schema } from '../../../../database'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  const commId = getRouterParam(event, 'commId')
  if (!propertyId || !commId) {
    throw createError({ statusCode: 400, statusMessage: 'IDs erforderlich' })
  }

  const db = getDatabase()

  const existing = await db.query.communications.findFirst({
    where: and(
      eq(schema.communications.id, commId),
      eq(schema.communications.propertyId, propertyId)
    )
  })

  if (!existing) {
    return { success: true, alreadyGone: true }
  }

  // Angehängte PDFs bleiben erhalten - sie verlieren nur ihre Herkunftsangabe.
  // (SQLite kann per ALTER TABLE keinen Fremdschlüssel nachrüsten, deshalb hier von Hand.)
  await db.update(schema.documents)
    .set({ communicationId: null })
    .where(eq(schema.documents.communicationId, commId))

  await db.delete(schema.communications)
    .where(eq(schema.communications.id, commId))

  // War das die letzte Nachricht des Threads, verschwindet der Thread mit.
  let removedThread = false
  if (existing.threadId) {
    const remaining = await db.query.communications.findMany({
      where: eq(schema.communications.threadId, existing.threadId),
      columns: { id: true }
    })
    if (remaining.length === 0) {
      await db.delete(schema.emailThreads)
        .where(eq(schema.emailThreads.id, existing.threadId))
      removedThread = true
    }
  }

  return { success: true, removedThread }
})
