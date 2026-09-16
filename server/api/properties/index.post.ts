import { getDatabase, schema } from '../../database'
import { randomUUID } from 'node:crypto'
import { geocodeAddress } from '../../utils/geocoding'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Titel des Grundstücks ist erforderlich'
    })
  }

  const db = getDatabase()
  const propId = 'prop-' + randomUUID().slice(0, 8)
  const now = Date.now()

  const askingPrice = body.askingPrice ? Number(body.askingPrice) : null
  const areaSqm = body.areaSqm ? Number(body.areaSqm) : null
  const pricePerSqm = askingPrice && areaSqm ? Math.round((askingPrice / areaSqm) * 100) / 100 : null

  let latitude = body.latitude ? Number(body.latitude) : null
  let longitude = body.longitude ? Number(body.longitude) : null

  // Auto-geocode address if coordinates not supplied
  if ((!latitude || !longitude) && body.address) {
    const geo = await geocodeAddress(body.address)
    if (geo) {
      latitude = geo.lat
      longitude = geo.lng
    }
  }

  await db.insert(schema.properties).values({
    id: propId,
    title: body.title,
    status: body.status || 'new',
    address: body.address || null,
    askingPrice,
    areaSqm,
    pricePerSqm,
    adUrl: body.adUrl || null,
    notes: body.notes || null,
    buildingLaw: body.buildingLaw || null,
    grz: body.grz ? Number(body.grz) : null,
    gfz: body.gfz ? Number(body.gfz) : null,
    developmentStatus: body.developmentStatus || null,
    purchaseCostsPercent: body.purchaseCostsPercent ? Number(body.purchaseCostsPercent) : 10.5,
    latitude,
    longitude,
    primaryImageUrl: body.primaryImageUrl || (Array.isArray(body.images) ? body.images[0] : null) || null,
    imagesJson: body.images ? (typeof body.images === 'string' ? body.images : JSON.stringify(body.images)) : null,
    createdAt: now,
    updatedAt: now
  })

  // Optional Parcel
  if (body.parcel) {
    await db.insert(schema.parcels).values({
      id: 'parcel-' + randomUUID().slice(0, 8),
      propertyId: propId,
      flstkennz: body.parcel.flstkennz || null,
      gemarkungName: body.parcel.gemarkungName || null,
      gemarkungSchluessel: body.parcel.gemarkungSchluessel || null,
      flur: body.parcel.flur ? Number(body.parcel.flur) : null,
      zaehler: body.parcel.zaehler ? Number(body.parcel.zaehler) : null,
      nenner: body.parcel.nenner ? Number(body.parcel.nenner) : null,
      officialArea: body.parcel.officialArea ? Number(body.parcel.officialArea) : null,
      borisBodenrichtwert: body.parcel.borisBodenrichtwert ? Number(body.parcel.borisBodenrichtwert) : null,
      borisStichtag: body.parcel.borisStichtag || null,
      borisEntwicklungszustand: body.parcel.borisEntwicklungszustand || null,
      borisNutzung: body.parcel.borisNutzung || null,
      priceHistoryJson: body.parcel.priceHistoryJson ? (typeof body.parcel.priceHistoryJson === 'string' ? body.parcel.priceHistoryJson : JSON.stringify(body.parcel.priceHistoryJson)) : null,
      geojsonGeometry: body.parcel.geojsonGeometry ? (typeof body.parcel.geojsonGeometry === 'string' ? body.parcel.geojsonGeometry : JSON.stringify(body.parcel.geojsonGeometry)) : null,
      lastFetchedAt: now
    })
  }

  // Optional Broker
  if (body.broker) {
    await db.insert(schema.brokers).values({
      id: 'broker-' + randomUUID().slice(0, 8),
      propertyId: propId,
      name: body.broker.name || null,
      company: body.broker.company || null,
      email: body.broker.email || null,
      phone: body.broker.phone || null,
      website: body.broker.website || null
    })
  }

  // Initial standard checklist items
  const standardChecklist = [
    { category: 'expose', title: 'Exposé & Verkaufsunterlagen' },
    { category: 'kataster', title: 'Amtlicher Flurkartenauszug (ALKIS)' },
    { category: 'bplan', title: 'Bebauungsplan / §34 BauGB Nachweis' },
    { category: 'grundbuch', title: 'Grundbuchauszug (Bestandsverzeichnis, Abt. II & III)' },
    { category: 'altlasten', title: 'Auskunft Altlasten- & Kampfmittelkataster' },
    { category: 'erschliessung', title: 'Erschließungsnachweis & Anliegerbeiträge' }
  ]

  for (const item of standardChecklist) {
    await db.insert(schema.checklistItems).values({
      id: 'chk-' + randomUUID().slice(0, 8),
      propertyId: propId,
      category: item.category,
      title: item.title,
      status: 'missing',
      notes: null,
      updatedAt: now
    })
  }

  return {
    id: propId,
    success: true
  }
})
