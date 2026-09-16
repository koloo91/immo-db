import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../../../database'

/**
 * Manuelle Erfassung: Preis von Hand eintragen oder das Inserat als offline markieren.
 *
 * Notwendig, weil ImmoScout keine automatische Prüfung zulässt - ohne diesen Weg hätten
 * die dort geführten Grundstücke dauerhaft eine leere Preiskurve.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  const markGone = body?.listingGone === true
  const price = body?.price !== undefined && body?.price !== null ? Number(body.price) : null

  if (!markGone && (price === null || !Number.isFinite(price) || price <= 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Gültiger Preis oder listingGone erforderlich' })
  }

  const db = getDatabase()
  const now = Date.now()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: { listingStatus: true }
  })
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  const status = (property as any).listingStatus || null
  if (!status) {
    await db.insert(schema.listingStatus).values({
      propertyId, state: 'unknown', consecutiveFailures: 0, firstSeenAt: now
    })
  }

  if (markGone) {
    await db.insert(schema.priceObservations).values({
      id: 'obs-' + randomUUID().slice(0, 8),
      propertyId,
      observedAt: now,
      kind: 'listing_gone',
      source: 'manual',
      note: body?.note || 'Von Hand als offline markiert'
    })
    await db.update(schema.listingStatus).set({
      state: 'offline', lastMessage: 'Von Hand als offline markiert', alertAckAt: now
    }).where(eq(schema.listingStatus.propertyId, propertyId))

    return { success: true, state: 'offline' }
  }

  const previous = property.askingPrice ?? null
  const pricePerSqm = property.areaSqm ? Math.round((price! / property.areaSqm) * 100) / 100 : null

  await db.insert(schema.priceObservations).values({
    id: 'obs-' + randomUUID().slice(0, 8),
    propertyId,
    observedAt: now,
    kind: previous === null ? 'first_seen' : 'price_change',
    price,
    previousPrice: previous,
    pricePerSqm,
    source: 'manual',
    note: body?.note || 'Von Hand erfasst'
  })

  // Von Hand eingetragene Werte gelten sofort - hier hat ja ein Mensch hingesehen.
  await db.update(schema.properties).set({
    askingPrice: price,
    pricePerSqm: pricePerSqm ?? property.pricePerSqm,
    updatedAt: now
  }).where(eq(schema.properties.id, propertyId))

  await db.update(schema.listingStatus).set({
    lastSeenPrice: price, pendingPrice: null, pendingPriceSeenAt: null
  }).where(eq(schema.listingStatus.propertyId, propertyId))

  const { reindexProperty } = await import('../../../utils/search')
  await reindexProperty(propertyId).catch(err => console.warn('[Suche] Index-Update:', err.message))

  return { success: true, price, previousPrice: previous }
})
