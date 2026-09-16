import { getDatabase, schema } from '../../../database'
import { eq, desc } from 'drizzle-orm'
import { generateBrokerEmail } from '../../../utils/gemini'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event).catch(() => ({}))
  const db = getDatabase()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: {
      broker: true,
      checklistItems: true,
      analyses: {
        orderBy: [desc(schema.propertyAnalyses.createdAt)],
        limit: 1
      }
    }
  })

  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  // Determine missing or requested items
  let missingItems: string[] = []
  if (Array.isArray(body?.items) && body.items.length > 0) {
    missingItems = body.items
  } else {
    missingItems = property.checklistItems
      .filter(item => item.status === 'missing' || item.status === 'requested')
      .map(item => item.title)
  }

  if (missingItems.length === 0) {
    missingItems = ['Aktueller Grundbuchauszug', 'Bebauungsplan / Erschließungsstatus', 'Flurkarte']
  }

  // Die offenen Fragen der letzten Gesamtanalyse fließen als Rückfragen mit ein.
  let openQuestions: string[] = []
  if (body?.includeOpenQuestions !== false) {
    try {
      const latest = property.analyses?.[0]
      const parsed = latest?.openQuestionsJson ? JSON.parse(latest.openQuestionsJson) : []
      if (Array.isArray(parsed)) {
        openQuestions = parsed.filter((q: any) => typeof q === 'string').slice(0, 8)
      }
    } catch {}
  }

  const draft = await generateBrokerEmail(property, property.broker, missingItems, openQuestions)

  return {
    draft,
    missingItems,
    openQuestions,
    broker: property.broker
  }
})
