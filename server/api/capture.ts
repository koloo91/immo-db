import { randomUUID } from 'node:crypto'
import { eq, like } from 'drizzle-orm'
import { getDatabase, schema } from '../database'
import { detectPortal, PORTAL_LABELS } from '../utils/listingCheck'
import { normalizeListingUrl } from '../utils/botWall'
import { reindexProperty } from '../utils/search'

/**
 * Nimmt Inseratsdaten entgegen, die das Lesezeichen im Browser des Nutzers ausgelesen hat.
 *
 * Hintergrund: ImmobilienScout24 weist Server-Abrufe mit HTTP 401 ab (gemessen, auch über
 * FlareSolverr). Ein echter Browser kommt durch - dort liegen die Werte sogar als JSON-LD
 * `RealEstateListing` vor.
 *
 * Der Aufruf kommt gleichherkunftig von der Seite /erfassen, nicht direkt von der
 * Inseratsseite: Chrome blockiert Anfragen von einer öffentlichen HTTPS-Seite an lokale
 * Adressen (Private Network Access) - gemessen, auch mit gesetztem
 * Access-Control-Allow-Private-Network. Das Lesezeichen navigiert deshalb hierher,
 * statt zu senden. Damit entfallen CORS und ein Token, und der Nutzer sieht vor dem
 * Speichern, was übernommen wird.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Nur POST' })
  }

  const body = await readBody(event)
  const url = normalizeListingUrl((body?.url || '').toString())
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'URL fehlt' })
  }

  const db = getDatabase()
  const now = Date.now()
  const portal = detectPortal(url)
  const price = toNumber(body?.price)
  const areaSqm = toNumber(body?.areaSqm)

  // Bestehendes Grundstück über die Exposé-Nummer finden - robuster als der
  // URL-Vergleich, weil geteilte Links Tracking-Parameter tragen.
  const existing = body?.exposeId
    ? await db.query.properties.findFirst({
        where: like(schema.properties.adUrl, `%${body.exposeId}%`)
      })
    : await db.query.properties.findFirst({ where: eq(schema.properties.adUrl, url) })

  if (existing) {
    return await updateExisting(existing, { url, portal, price, areaSqm, body, now })
  }
  return await createNew({ url, portal, price, areaSqm, body, now })
})

async function updateExisting(property: any, ctx: any) {
  const db = getDatabase()
  const { price, body, now, portal } = ctx

  await ensureStatus(property.id, portal)
  const status = await db.query.listingStatus.findFirst({
    where: eq(schema.listingStatus.propertyId, property.id)
  })

  const updates: Record<string, any> = {
    state: 'online',
    lastCheckedAt: now,
    lastOkAt: now,
    lastMessage: `Per Lesezeichen aus dem Browser übernommen (${PORTAL_LABELS[portal as keyof typeof PORTAL_LABELS]})`,
    consecutiveFailures: 0,
    suspectSince: null,
    firstSeenAt: status?.firstSeenAt ?? now
  }
  if (body?.title) updates.lastSeenTitle = body.title
  if (price !== null) updates.lastSeenPrice = price

  let priceChanged = false
  const known = property.askingPrice ?? null

  if (price !== null && known !== null && Math.round(price) !== Math.round(known)) {
    // Gleiche Regel wie beim automatischen Lauf: vorschlagen, nicht überschreiben.
    priceChanged = true
    updates.pendingPrice = price
    updates.pendingPriceSeenAt = now
    updates.alertAckAt = null

    await db.insert(schema.priceObservations).values({
      id: 'obs-' + randomUUID().slice(0, 8),
      propertyId: property.id,
      observedAt: now,
      kind: 'price_change',
      price,
      previousPrice: known,
      pricePerSqm: property.areaSqm ? Math.round((price / property.areaSqm) * 100) / 100 : null,
      source: 'manual',
      note: 'Aus dem Inserat übernommen (Lesezeichen)'
    })
  } else if (price !== null && known === null) {
    await db.insert(schema.priceObservations).values({
      id: 'obs-' + randomUUID().slice(0, 8),
      propertyId: property.id,
      observedAt: now,
      kind: 'first_seen',
      price,
      pricePerSqm: property.areaSqm ? Math.round((price / property.areaSqm) * 100) / 100 : null,
      source: 'manual',
      note: 'Erstmals per Lesezeichen erfasst'
    })
  }

  await db.update(schema.listingStatus).set(updates)
    .where(eq(schema.listingStatus.propertyId, property.id))

  await reindexProperty(property.id).catch(() => {})

  return {
    success: true,
    action: 'updated',
    propertyId: property.id,
    title: property.title,
    priceChanged,
    price,
    knownPrice: known,
    message: priceChanged
      ? `Preisänderung erkannt: ${fmt(known)} → ${fmt(price)}. Im Grundstück bestätigen.`
      : 'Inserat geprüft – keine Preisänderung.'
  }
}

async function createNew(ctx: any) {
  const db = getDatabase()
  const { url, portal, price, areaSqm, body, now } = ctx

  const propertyId = 'prop-' + randomUUID().slice(0, 8)
  const pricePerSqm = price && areaSqm ? Math.round((price / areaSqm) * 100) / 100 : null

  await db.insert(schema.properties).values({
    id: propertyId,
    title: body?.title || 'Grundstück aus Inserat',
    status: 'new',
    address: body?.address || null,
    askingPrice: price,
    areaSqm,
    pricePerSqm,
    adUrl: url,
    notes: body?.notes || null,
    buildingLaw: body?.buildingLaw || null,
    developmentStatus: body?.developmentStatus || null,
    createdAt: now,
    updatedAt: now
  })

  if (body?.broker?.name || body?.broker?.company) {
    await db.insert(schema.brokers).values({
      id: 'broker-' + randomUUID().slice(0, 8),
      propertyId,
      name: body.broker.name || null,
      company: body.broker.company || null,
      email: body.broker.email || null,
      phone: body.broker.phone || null,
      website: null
    })
  }

  await db.insert(schema.listingStatus).values({
    propertyId,
    portal,
    state: 'online',
    lastCheckedAt: now,
    lastOkAt: now,
    lastMessage: 'Per Lesezeichen angelegt',
    consecutiveFailures: 0,
    lastSeenTitle: body?.title || null,
    lastSeenPrice: price,
    firstSeenAt: now
  })

  if (price !== null) {
    await db.insert(schema.priceObservations).values({
      id: 'obs-' + randomUUID().slice(0, 8),
      propertyId,
      observedAt: now,
      kind: 'first_seen',
      price,
      pricePerSqm,
      source: 'manual',
      note: `Erstmals erfasst über ${PORTAL_LABELS[portal as keyof typeof PORTAL_LABELS]} (Lesezeichen)`
    })
  }

  await reindexProperty(propertyId).catch(() => {})

  return {
    success: true,
    action: 'created',
    propertyId,
    title: body?.title || 'Grundstück aus Inserat',
    price,
    message: `Neues Grundstück angelegt: ${body?.title || propertyId}`
  }
}

async function ensureStatus(propertyId: string, portal: string) {
  const db = getDatabase()
  const existing = await db.query.listingStatus.findFirst({
    where: eq(schema.listingStatus.propertyId, propertyId)
  })
  if (!existing) {
    await db.insert(schema.listingStatus).values({
      propertyId, portal, state: 'unknown', consecutiveFailures: 0
    })
  }
}

/** "129.000 €" und "129000" führen beide auf 129000. */
function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

function fmt(value: number | null) {
  return value ? value.toLocaleString('de-DE') + ' €' : '–'
}
