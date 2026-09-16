import { getDatabase, schema } from '../../../database'
import { eq } from 'drizzle-orm'
import { fetchFromGeobasis } from '../../../utils/geobasis'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID erforderlich' })
  }

  const body = await readBody(event).catch(() => ({}))
  const db = getDatabase()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, id),
    with: { parcel: true }
  })

  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  let flstkennz = body?.flstkennz || property.parcel?.flstkennz

  // If no kennzeichen yet, try resolving from address
  if (!flstkennz && property.address) {
    const addressRes = await fetchFromGeobasis('/api/flurstueck/by-address', { address: property.address })
    if (Array.isArray(addressRes) && addressRes.length > 0) {
      flstkennz = addressRes[0].properties?.flstkennz || addressRes[0].flstkennz
    } else if (addressRes?.flstkennz) {
      flstkennz = addressRes.flstkennz
    }
  }

  if (!flstkennz) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Kein Flurstückskennzeichen vorhanden und Adresse konnte nicht automatisch aufgelöst werden.'
    })
  }

  // 1. Fetch parcel info & geometry
  const parcelDetails = await fetchFromGeobasis(`/api/flurstueck/${encodeURIComponent(flstkennz)}`)

  // 2. Fetch BORIS prices & history
  let pricesRes: any = null
  try {
    pricesRes = await fetchFromGeobasis(`/api/flurstueck/${encodeURIComponent(flstkennz)}/preise`)
  } catch (e) {
    console.warn('Could not fetch BORIS prices:', e)
  }

  const pProps = parcelDetails?.properties || parcelDetails || {}
  const gemarkungName = pProps.gemarkung || property.parcel?.gemarkungName
  const gemarkungSchluessel = pProps.gemaschl || property.parcel?.gemarkungSchluessel
  const flur = pProps.flur ? parseInt(pProps.flur, 10) : property.parcel?.flur
  const zaehler = pProps.flstnrzae ? parseInt(pProps.flstnrzae, 10) : property.parcel?.zaehler
  const nenner = pProps.flstnrnen ? parseInt(pProps.flstnrnen, 10) : property.parcel?.nenner
  const officialArea = pProps.flaeche ? Number(pProps.flaeche) : property.parcel?.officialArea

  const borisBodenrichtwert = pricesRes?.currentPrice?.bodenrichtwert || pricesRes?.bodenrichtwert || property.parcel?.borisBodenrichtwert
  const borisStichtag = pricesRes?.currentPrice?.stichtag || pricesRes?.stichtag || property.parcel?.borisStichtag
  const borisEntwicklungszustand = pricesRes?.currentPrice?.entwicklungszustand || property.parcel?.borisEntwicklungszustand
  const borisNutzung = pricesRes?.currentPrice?.nutzung || property.parcel?.borisNutzung
  const priceHistoryJson = pricesRes?.history ? JSON.stringify(pricesRes.history) : property.parcel?.priceHistoryJson
  const geojsonGeometry = parcelDetails?.geometry ? JSON.stringify(parcelDetails.geometry) : property.parcel?.geojsonGeometry

  // Calculate center lat/lng from geometry if available
  let lat = property.latitude
  let lng = property.longitude
  if (parcelDetails?.geometry?.coordinates) {
    try {
      const coords = parcelDetails.geometry.coordinates
      // handle Polygon or MultiPolygon
      const ring = parcelDetails.geometry.type === 'MultiPolygon' ? coords[0][0] : coords[0]
      if (Array.isArray(ring) && ring.length > 0) {
        let sumLng = 0, sumLat = 0
        for (const pt of ring) {
          sumLng += pt[0]
          sumLat += pt[1]
        }
        lng = sumLng / ring.length
        lat = sumLat / ring.length
      }
    } catch {}
  }

  const now = Date.now()

  // Update property with coords and official area if not set
  await db.update(schema.properties).set({
    latitude: lat,
    longitude: lng,
    areaSqm: property.areaSqm || officialArea || null,
    updatedAt: now
  }).where(eq(schema.properties.id, id))

  if (property.parcel) {
    await db.update(schema.parcels).set({
      flstkennz,
      gemarkungName,
      gemarkungSchluessel,
      flur,
      zaehler,
      nenner,
      officialArea,
      borisBodenrichtwert,
      borisStichtag,
      borisEntwicklungszustand,
      borisNutzung,
      priceHistoryJson,
      geojsonGeometry,
      lastFetchedAt: now
    }).where(eq(schema.parcels.id, property.parcel.id))
  } else {
    await db.insert(schema.parcels).values({
      id: 'parcel-' + randomUUID().slice(0, 8),
      propertyId: id,
      flstkennz,
      gemarkungName,
      gemarkungSchluessel,
      flur,
      zaehler,
      nenner,
      officialArea,
      borisBodenrichtwert,
      borisStichtag,
      borisEntwicklungszustand,
      borisNutzung,
      priceHistoryJson,
      geojsonGeometry,
      lastFetchedAt: now
    })
  }

  return {
    success: true,
    flstkennz,
    borisBodenrichtwert,
    officialArea
  }
})
