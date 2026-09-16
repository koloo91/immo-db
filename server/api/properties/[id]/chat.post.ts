import { getDatabase, schema } from '../../../database'
import { eq, asc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { chatWithProperty } from '../../../utils/gemini'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  if (!body?.message) {
    throw createError({ statusCode: 400, statusMessage: 'Nachricht erforderlich' })
  }

  const db = getDatabase()
  const now = Date.now()

  // 1. Fetch property and documents
  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: {
      parcel: true,
      documents: true
    }
  })

  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  // 2. Fetch past chat history
  const pastChats = await db.query.documentChats.findMany({
    where: eq(schema.documentChats.propertyId, propertyId),
    orderBy: [asc(schema.documentChats.createdAt)]
  })

  const history = pastChats.map(c => ({
    role: c.role as 'user' | 'assistant',
    message: c.message
  }))

  // 3. Save user message
  await db.insert(schema.documentChats).values({
    id: 'chat-' + randomUUID().slice(0, 8),
    propertyId,
    role: 'user',
    message: body.message,
    createdAt: now
  })

  // 4. Prepare documents summary
  const docsSummary = property.documents.map(d => {
    return `Dokument "${d.fileName}" (${d.docType}):\n${d.aiSummary || 'Keine Zusammenfassung'}\nExtrahierte Daten: ${d.aiExtractedDataJson || '{}'}\nRisiken: ${d.aiRiskAssessmentJson || '{}'}`
  }).join('\n\n---\n\n')

  // 5. Call Gemini
  let reply = ''
  try {
    reply = await chatWithProperty(history, body.message, property, docsSummary)
  } catch (err: any) {
    reply = `Entschuldigung, beim Beantworten ist ein Fehler aufgetreten: ${err.message}`
  }

  // 6. Save assistant reply
  const replyId = 'chat-' + randomUUID().slice(0, 8)
  await db.insert(schema.documentChats).values({
    id: replyId,
    propertyId,
    role: 'assistant',
    message: reply,
    createdAt: now + 1
  })

  return {
    id: replyId,
    role: 'assistant',
    message: reply,
    createdAt: now + 1
  }
})
