import { getDatabase, schema } from '../../../database'
import { eq } from 'drizzle-orm'
import { removePropertyFromIndex } from '../../../utils/search'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID erforderlich' })
  }

  const db = getDatabase()
  await db.delete(schema.properties).where(eq(schema.properties.id, id))

  // Sonst blieben Treffer auf ein Grundstück stehen, das es nicht mehr gibt.
  await removePropertyFromIndex(id).catch(err => console.warn('[Suche] Index-Update:', err.message))

  return { success: true }
})
