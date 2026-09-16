import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../../../database'
import { reindexProperty } from '../../../utils/search'

/**
 * Meldung am Grundstück behandeln: Preisvorschlag übernehmen oder Hinweis bestätigen.
 * Der automatische Lauf schreibt niemals direkt in `askingPrice` - dort hängen
 * Preis/m², Vergleichsmatrix, Nebenkostenrechner und die KI-Gesamtbewertung dran.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  const action = body?.action === 'accept' ? 'accept' : 'dismiss'

  const db = getDatabase()
  const now = Date.now()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: { listingStatus: true }
  })
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  const status = (property as any).listingStatus
  if (action === 'accept' && status?.pendingPrice) {
    const price = status.pendingPrice
    const pricePerSqm = property.areaSqm ? Math.round((price / property.areaSqm) * 100) / 100 : property.pricePerSqm

    await db.update(schema.properties).set({
      askingPrice: price, pricePerSqm, updatedAt: now
    }).where(eq(schema.properties.id, propertyId))

    await db.update(schema.listingStatus).set({
      pendingPrice: null, pendingPriceSeenAt: null, alertAckAt: now
    }).where(eq(schema.listingStatus.propertyId, propertyId))

    await reindexProperty(propertyId).catch(err => console.warn('[Suche] Index-Update:', err.message))
    return { success: true, action, askingPrice: price }
  }

  await db.update(schema.listingStatus).set({ alertAckAt: now })
    .where(eq(schema.listingStatus.propertyId, propertyId))

  return { success: true, action }
})
