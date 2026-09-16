import { getDatabase, schema } from '../../../database'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { geocodeAddress } from '../../../utils/geocoding'
import { reindexProperty } from '../../../utils/search'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID erforderlich' })
  }

  const body = await readBody(event)
  const db = getDatabase()
  const now = Date.now()

  const current = await db.query.properties.findFirst({ where: eq(schema.properties.id, id) })
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  const askingPrice = body.askingPrice !== undefined ? (body.askingPrice ? Number(body.askingPrice) : null) : undefined
  const areaSqm = body.areaSqm !== undefined ? (body.areaSqm ? Number(body.areaSqm) : null) : undefined
  let pricePerSqm = undefined
  if (askingPrice !== undefined || areaSqm !== undefined) {
    const finalPrice = askingPrice !== undefined ? askingPrice : current.askingPrice
    const finalArea = areaSqm !== undefined ? areaSqm : current.areaSqm
    if (finalPrice && finalArea) {
      pricePerSqm = Math.round((finalPrice / finalArea) * 100) / 100
    }
  }

  const updateData: any = {
    updatedAt: now
  }

  if (body.title !== undefined) updateData.title = body.title
  if (body.status !== undefined) updateData.status = body.status
  if (body.address !== undefined) updateData.address = body.address
  if (askingPrice !== undefined) updateData.askingPrice = askingPrice
  if (areaSqm !== undefined) updateData.areaSqm = areaSqm
  if (pricePerSqm !== undefined) updateData.pricePerSqm = pricePerSqm
  if (body.adUrl !== undefined) updateData.adUrl = body.adUrl
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.buildingLaw !== undefined) updateData.buildingLaw = body.buildingLaw
  if (body.grz !== undefined) updateData.grz = body.grz ? Number(body.grz) : null
  if (body.gfz !== undefined) updateData.gfz = body.gfz ? Number(body.gfz) : null
  if (body.developmentStatus !== undefined) updateData.developmentStatus = body.developmentStatus
  if (body.purchaseCostsPercent !== undefined) updateData.purchaseCostsPercent = Number(body.purchaseCostsPercent)
  if (body.latitude !== undefined) updateData.latitude = body.latitude ? Number(body.latitude) : null
  if (body.longitude !== undefined) updateData.longitude = body.longitude ? Number(body.longitude) : null
  if (body.primaryImageUrl !== undefined) updateData.primaryImageUrl = body.primaryImageUrl || null
  if (body.images !== undefined) updateData.imagesJson = Array.isArray(body.images) ? JSON.stringify(body.images) : body.images
  if (body.ancillaryCostsJson !== undefined) {
    updateData.ancillaryCostsJson = typeof body.ancillaryCostsJson === 'string'
      ? body.ancillaryCostsJson
      : JSON.stringify(body.ancillaryCostsJson)
  }

  // Auto-geocode if coordinates missing but address provided
  if ((!updateData.latitude || !updateData.longitude) && (body.address || current.address)) {
    const geo = await geocodeAddress(body.address || current.address)
    if (geo) {
      updateData.latitude = geo.lat
      updateData.longitude = geo.lng
    }
  }

  await db.update(schema.properties).set(updateData).where(eq(schema.properties.id, id))

  // Update Broker if provided
  if (body.broker) {
    const existingBroker = await db.query.brokers.findFirst({ where: eq(schema.brokers.propertyId, id) })
    if (existingBroker) {
      await db.update(schema.brokers).set({
        name: body.broker.name || null,
        company: body.broker.company || null,
        email: body.broker.email || null,
        phone: body.broker.phone || null,
        website: body.broker.website || null
      }).where(eq(schema.brokers.id, existingBroker.id))
    } else {
      await db.insert(schema.brokers).values({
        id: 'broker-' + randomUUID().slice(0, 8),
        propertyId: id,
        name: body.broker.name || null,
        company: body.broker.company || null,
        email: body.broker.email || null,
        phone: body.broker.phone || null,
        website: body.broker.website || null
      })
    }
  }

  // Update Parcel if provided
  if (body.parcel !== undefined) {
    const existingParcel = await db.query.parcels.findFirst({ where: eq(schema.parcels.propertyId, id) })
    if (body.parcel === null) {
      if (existingParcel) {
        await db.delete(schema.parcels).where(eq(schema.parcels.id, existingParcel.id))
      }
    } else {
      const p = body.parcel
      const parcelData: any = {
        flstkennz: p.flstkennz !== undefined ? (p.flstkennz || null) : (existingParcel?.flstkennz ?? null),
        gemarkungName: p.gemarkungName !== undefined ? (p.gemarkungName || null) : (existingParcel?.gemarkungName ?? null),
        gemarkungSchluessel: p.gemarkungSchluessel !== undefined ? (p.gemarkungSchluessel || null) : (existingParcel?.gemarkungSchluessel ?? null),
        flur: p.flur !== undefined && p.flur !== null && p.flur !== '' ? Number(p.flur) : null,
        zaehler: p.zaehler !== undefined && p.zaehler !== null && p.zaehler !== '' ? Number(p.zaehler) : null,
        nenner: p.nenner !== undefined && p.nenner !== null && p.nenner !== '' ? Number(p.nenner) : null,
        officialArea: p.officialArea !== undefined && p.officialArea !== null && p.officialArea !== '' ? Number(p.officialArea) : null,
        borisBodenrichtwert: p.borisBodenrichtwert !== undefined && p.borisBodenrichtwert !== null && p.borisBodenrichtwert !== '' ? Number(p.borisBodenrichtwert) : null,
        borisStichtag: p.borisStichtag !== undefined ? (p.borisStichtag || null) : (existingParcel?.borisStichtag ?? null),
        borisEntwicklungszustand: p.borisEntwicklungszustand !== undefined ? (p.borisEntwicklungszustand || null) : (existingParcel?.borisEntwicklungszustand ?? null),
        borisNutzung: p.borisNutzung !== undefined ? (p.borisNutzung || null) : (existingParcel?.borisNutzung ?? null),
        lastFetchedAt: Date.now()
      }

      if (p.geojsonGeometry !== undefined) {
        parcelData.geojsonGeometry = typeof p.geojsonGeometry === 'string' ? p.geojsonGeometry : JSON.stringify(p.geojsonGeometry)
      }
      if (p.priceHistoryJson !== undefined) {
        parcelData.priceHistoryJson = typeof p.priceHistoryJson === 'string' ? p.priceHistoryJson : JSON.stringify(p.priceHistoryJson)
      }

      if (existingParcel) {
        await db.update(schema.parcels).set(parcelData).where(eq(schema.parcels.id, existingParcel.id))
      } else {
        await db.insert(schema.parcels).values({
          id: 'parcel-' + randomUUID().slice(0, 8),
          propertyId: id,
          ...parcelData
        })
      }
    }
  }

  // Suchindex nachziehen - Fehler dürfen den Request nicht kippen.
  await reindexProperty(id).catch(err => console.warn('[Suche] Index-Update:', err.message))

  return { success: true }
})
