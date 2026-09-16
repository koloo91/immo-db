import { randomUUID } from 'node:crypto'
import { eq, asc } from 'drizzle-orm'
import { getDatabase, schema } from '../../../database'
import { analyzePropertyOverall, getGeminiModel } from '../../../utils/gemini'
import { reindexProperty } from '../../../utils/search'

/**
 * Erzeugt eine neue Version der KI-Gesamtbewertung. Vorherige Versionen bleiben
 * erhalten, damit man Veränderungen (Preissenkung, neue Unterlagen) nachvollziehen kann.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const db = getDatabase()
  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: {
      parcel: true,
      broker: true,
      checklistItems: true,
      documents: { orderBy: [asc(schema.documents.createdAt)] },
      communications: { orderBy: [asc(schema.communications.createdAt)] }
    }
  })

  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  const analysedDocuments = property.documents.filter(doc => doc.analysisStatus === 'done')
  const emails = property.communications.filter(comm => comm.channel === 'email' && comm.state !== 'draft')

  const result = await analyzePropertyOverall({
    property,
    documents: analysedDocuments,
    emails,
    checklist: property.checklistItems
  })

  const analysisId = 'ana-' + randomUUID().slice(0, 8)
  const now = Date.now()

  await db.insert(schema.propertyAnalyses).values({
    id: analysisId,
    propertyId,
    createdAt: now,
    model: result.isSimulated ? null : getGeminiModel(),
    isSimulated: result.isSimulated ? 1 : 0,
    scoreOverall: typeof result.scoreOverall === 'number' ? Math.round(result.scoreOverall) : null,
    verdict: result.verdict || null,
    summary: result.summary || null,
    risksJson: JSON.stringify(result.risks || []),
    opportunitiesJson: JSON.stringify(result.opportunities || []),
    openQuestionsJson: JSON.stringify(result.openQuestions || []),
    priceAssessmentJson: JSON.stringify(result.priceAssessment || {}),
    inputSnapshotJson: JSON.stringify({
      askingPrice: property.askingPrice,
      areaSqm: property.areaSqm,
      pricePerSqm: property.pricePerSqm,
      status: property.status,
      borisBodenrichtwert: property.parcel?.borisBodenrichtwert ?? null,
      documentIds: analysedDocuments.map(doc => doc.id),
      documentCount: analysedDocuments.length,
      emailCount: emails.length,
      openChecklistCount: property.checklistItems.filter(i => i.status === 'missing' || i.status === 'requested').length
    })
  })

  await db.update(schema.properties)
    .set({ updatedAt: now })
    .where(eq(schema.properties.id, propertyId))


  // Suchindex nachziehen - Fehler dürfen den Request nicht kippen,
  // der Start-Reindex holt es sonst nach.
  await reindexProperty(propertyId).catch(err => console.warn('[Suche] Index-Update:', err.message))

  const created = await db.query.propertyAnalyses.findFirst({
    where: eq(schema.propertyAnalyses.id, analysisId)
  })

  return created
})
