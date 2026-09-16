import { getDatabase, schema } from '../../../database'
import { randomUUID } from 'node:crypto'
import { upsertThread } from '../../../utils/emailThreads'
import { reindexProperty } from '../../../utils/search'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  if (!body?.summary) {
    throw createError({ statusCode: 400, statusMessage: 'Zusammenfassung/Notiz ist erforderlich' })
  }

  const db = getDatabase()
  const commId = 'comm-' + randomUUID().slice(0, 8)
  const now = Date.now()

  const channel = body.channel || 'note'
  const state = ['logged', 'draft', 'sent', 'received'].includes(body.state) ? body.state : 'logged'
  const occurredAt = body.occurredAt
    ? (typeof body.occurredAt === 'number' ? body.occurredAt : Date.parse(body.occurredAt) || now)
    : now

  // Mails mit Betreff wandern in einen Thread, Telefonate und Notizen bleiben threadlos.
  let threadId: string | null = null
  if (channel === 'email' && body.subject && state !== 'draft') {
    threadId = await upsertThread({
      propertyId,
      subject: body.subject,
      participants: [body.fromAddress, body.toAddress],
      messageAt: occurredAt
    })
  }

  await db.insert(schema.communications).values({
    id: commId,
    propertyId,
    channel,
    direction: body.direction || 'outbound',
    summary: body.summary,
    details: body.details || null,
    nextFollowUpDate: body.nextFollowUpDate || null,
    createdAt: now,
    threadId,
    subject: body.subject || null,
    fromAddress: body.fromAddress || null,
    toAddress: body.toAddress || null,
    occurredAt,
    bodyText: body.bodyText || null,
    state,
    aiInsightsJson: body.insights ? JSON.stringify(body.insights) : null
  })


  // Suchindex nachziehen - Fehler dürfen den Request nicht kippen,
  // der Start-Reindex holt es sonst nach.
  await reindexProperty(propertyId).catch(err => console.warn('[Suche] Index-Update:', err.message))

  return { id: commId, threadId, success: true }
})
