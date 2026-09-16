import { getDatabase, schema } from '../../../database'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  if (!body?.title) {
    throw createError({ statusCode: 400, statusMessage: 'Titel des Unterlageneintrags erforderlich' })
  }

  const db = getDatabase()
  const itemId = 'chk-' + randomUUID().slice(0, 8)
  const now = Date.now()

  await db.insert(schema.checklistItems).values({
    id: itemId,
    propertyId,
    category: body.category || 'sonstiges',
    title: body.title,
    status: body.status || 'missing',
    notes: body.notes || null,
    updatedAt: now
  })

  return { id: itemId, success: true }
})
