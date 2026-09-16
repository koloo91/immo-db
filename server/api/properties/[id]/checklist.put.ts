import { getDatabase, schema } from '../../../database'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  if (!body?.id) {
    throw createError({ statusCode: 400, statusMessage: 'Checklist Item ID erforderlich' })
  }

  const db = getDatabase()
  const now = Date.now()

  const updateData: any = { updatedAt: now }
  if (body.status !== undefined) updateData.status = body.status
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.title !== undefined) updateData.title = body.title

  await db.update(schema.checklistItems).set(updateData).where(
    and(
      eq(schema.checklistItems.id, body.id),
      eq(schema.checklistItems.propertyId, propertyId)
    )
  )

  return { success: true }
})
