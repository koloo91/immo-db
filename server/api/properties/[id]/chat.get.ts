import { getDatabase, schema } from '../../../database'
import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const db = getDatabase()
  const chats = await db.query.documentChats.findMany({
    where: eq(schema.documentChats.propertyId, propertyId),
    orderBy: [asc(schema.documentChats.createdAt)]
  })

  return chats
})
