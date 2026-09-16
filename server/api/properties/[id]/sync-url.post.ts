import { getDatabase, schema } from '../../../database'
import { eq } from 'drizzle-orm'
import { fetchHtmlWithFlareSolverr } from '../../../utils/flaresolverr'
import { extractPropertyFromHtml } from '../../../utils/urlExtractor'
import { randomUUID } from 'node:crypto'
import { normalizeListingUrl } from '../../../utils/botWall'
import { geocodeAddress } from '../../../utils/geocoding'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const db = getDatabase()
  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: { broker: true }
  })

  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  if (!property.adUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Keine Inserat-URL im Grundstück hinterlegt' })
  }

  const cleanUrl = normalizeListingUrl(property.adUrl)

  // 1. Fetch HTML - wirft bei Bot-Schutzseiten, damit der Sync die vorhandenen
  // Daten nicht mit dem Inhalt einer Fehlerseite überschreibt.
  const { html, method } = await fetchHtmlWithFlareSolverr(cleanUrl)

  // 2. Extract structured data with Gemini
  const extracted = await extractPropertyFromHtml(html, cleanUrl)

  // 3. Update property
  const now = Date.now()
  const updates: any = { updatedAt: now }

  if (extracted.title && !property.title) updates.title = extracted.title
  if (extracted.address && !property.address) updates.address = extracted.address
  if (extracted.askingPrice) updates.askingPrice = extracted.askingPrice
  if (extracted.areaSqm) updates.areaSqm = extracted.areaSqm
  if (extracted.askingPrice && extracted.areaSqm) {
    updates.pricePerSqm = Math.round((extracted.askingPrice / extracted.areaSqm) * 100) / 100
  }
  if (extracted.buildingLaw && !property.buildingLaw) updates.buildingLaw = extracted.buildingLaw
  if (extracted.grz !== null && extracted.grz !== undefined) updates.grz = extracted.grz
  if (extracted.gfz !== null && extracted.gfz !== undefined) updates.gfz = extracted.gfz
  if (extracted.developmentStatus && !property.developmentStatus) updates.developmentStatus = extracted.developmentStatus
  if (extracted.notes && !property.notes) updates.notes = extracted.notes
  if (extracted.primaryImageUrl) updates.primaryImageUrl = extracted.primaryImageUrl
  if (extracted.images && extracted.images.length > 0) updates.imagesJson = JSON.stringify(extracted.images)

  // Auto-geocode if coordinates missing
  if ((!property.latitude || !property.longitude) && (extracted.address || property.address)) {
    const geo = await geocodeAddress(extracted.address || property.address)
    if (geo) {
      updates.latitude = geo.lat
      updates.longitude = geo.lng
    }
  }

  await db.update(schema.properties).set(updates).where(eq(schema.properties.id, propertyId))

  // Update Broker if present
  if (extracted.broker && (extracted.broker.name || extracted.broker.company || extracted.broker.email || extracted.broker.phone)) {
    if (property.broker) {
      await db.update(schema.brokers).set({
        name: extracted.broker.name || property.broker.name,
        company: extracted.broker.company || property.broker.company,
        email: extracted.broker.email || property.broker.email,
        phone: extracted.broker.phone || property.broker.phone
      }).where(eq(schema.brokers.id, property.broker.id))
    } else {
      await db.insert(schema.brokers).values({
        id: 'broker-' + randomUUID().slice(0, 8),
        propertyId,
        name: extracted.broker.name || null,
        company: extracted.broker.company || null,
        email: extracted.broker.email || null,
        phone: extracted.broker.phone || null,
        website: null
      })
    }
  }

  return {
    success: true,
    method,
    warning: (extracted as any).warning || null,
    extracted
  }
})
