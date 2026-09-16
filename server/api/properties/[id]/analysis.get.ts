import { eq, desc } from 'drizzle-orm'
import { getDatabase, schema } from '../../../database'

/** Gibt die Versionshistorie der Gesamtbewertungen zurück, neueste zuerst. */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const db = getDatabase()
  return await db.query.propertyAnalyses.findMany({
    where: eq(schema.propertyAnalyses.propertyId, propertyId),
    orderBy: [desc(schema.propertyAnalyses.createdAt)]
  })
})
