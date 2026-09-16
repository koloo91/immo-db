import { eq, and } from 'drizzle-orm'
import { getDatabase, schema } from '../../../../../database'
import { upsertThread } from '../../../../../utils/emailThreads'

/**
 * Aktualisiert einen Mail-Eintrag - vor allem, um einen Entwurf als gesendet zu markieren.
 * Beim Wechsel von 'draft' auf 'sent' wandert der Eintrag in den passenden Thread.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  const commId = getRouterParam(event, 'commId')
  if (!propertyId || !commId) {
    throw createError({ statusCode: 400, statusMessage: 'IDs erforderlich' })
  }

  const body = await readBody(event)
  const db = getDatabase()

  const existing = await db.query.communications.findFirst({
    where: and(
      eq(schema.communications.id, commId),
      eq(schema.communications.propertyId, propertyId)
    )
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Eintrag nicht gefunden' })
  }

  const updates: Record<string, any> = {}

  if (typeof body?.subject === 'string') updates.subject = body.subject
  if (typeof body?.bodyText === 'string') updates.bodyText = body.bodyText
  if (typeof body?.summary === 'string' && body.summary.trim()) updates.summary = body.summary.trim()
  if (typeof body?.toAddress === 'string') updates.toAddress = body.toAddress
  if (typeof body?.fromAddress === 'string') updates.fromAddress = body.fromAddress
  if (body?.nextFollowUpDate !== undefined) updates.nextFollowUpDate = body.nextFollowUpDate || null

  if (body?.state && ['draft', 'sent', 'received', 'logged'].includes(body.state)) {
    updates.state = body.state

    if (body.state === 'sent' && existing.state === 'draft') {
      const sentAt = Date.now()
      updates.occurredAt = sentAt
      updates.threadId = await upsertThread({
        propertyId,
        subject: updates.subject || existing.subject || 'E-Mail ohne Betreff',
        participants: [
          updates.fromAddress ?? existing.fromAddress,
          updates.toAddress ?? existing.toAddress
        ],
        messageAt: sentAt
      })
    }
  }

  if (Object.keys(updates).length === 0) {
    return { id: commId, success: true, unchanged: true }
  }

  await db.update(schema.communications)
    .set(updates)
    .where(eq(schema.communications.id, commId))

  return { id: commId, success: true, state: updates.state ?? existing.state }
})
