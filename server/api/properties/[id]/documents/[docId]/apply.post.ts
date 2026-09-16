import { getDatabase, schema } from '../../../../../database'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')
  if (!propertyId || !docId) {
    throw createError({ statusCode: 400, statusMessage: 'IDs erforderlich' })
  }

  const db = getDatabase()
  const doc = await db.query.documents.findFirst({
    where: and(
      eq(schema.documents.id, docId),
      eq(schema.documents.propertyId, propertyId)
    )
  })

  if (!doc || !doc.aiExtractedDataJson) {
    throw createError({ statusCode: 404, statusMessage: 'Keine extrahierten Daten für dieses Dokument vorhanden' })
  }

  const extracted = JSON.parse(doc.aiExtractedDataJson)
  const now = Date.now()

  // Update property
  const propUpdates: any = { updatedAt: now }
  if (extracted.address) propUpdates.address = extracted.address
  if (extracted.askingPrice) propUpdates.askingPrice = Number(extracted.askingPrice)
  if (extracted.areaSqm) propUpdates.areaSqm = Number(extracted.areaSqm)
  if (extracted.askingPrice && extracted.areaSqm) {
    propUpdates.pricePerSqm = Math.round((Number(extracted.askingPrice) / Number(extracted.areaSqm)) * 100) / 100
  }
  if (extracted.buildingLaw) propUpdates.buildingLaw = extracted.buildingLaw
  if (extracted.grz) propUpdates.grz = Number(extracted.grz)
  if (extracted.gfz) propUpdates.gfz = Number(extracted.gfz)
  if (extracted.developmentStatus) propUpdates.developmentStatus = extracted.developmentStatus

  await db.update(schema.properties).set(propUpdates).where(eq(schema.properties.id, propertyId))

  // Update or insert Parcel if flurstueck data exists
  if (extracted.flurstueck) {
    const fl = extracted.flurstueck
    const existingParcel = await db.query.parcels.findFirst({
      where: eq(schema.parcels.propertyId, propertyId)
    })

    const parcelValues: any = {
      gemarkungName: fl.gemarkung || undefined,
      flur: fl.flur ? Number(fl.flur) : undefined,
      zaehler: fl.zaehler ? Number(fl.zaehler) : undefined,
      nenner: fl.nenner ? Number(fl.nenner) : undefined,
      flstkennz: fl.kennzeichen || undefined,
      lastFetchedAt: now
    }

    if (existingParcel) {
      await db.update(schema.parcels).set(parcelValues).where(eq(schema.parcels.id, existingParcel.id))
    } else if (fl.gemarkung || fl.flur || fl.zaehler || fl.kennzeichen) {
      await db.insert(schema.parcels).values({
        id: 'parcel-' + randomUUID().slice(0, 8),
        propertyId,
        flstkennz: fl.kennzeichen || null,
        gemarkungName: fl.gemarkung || null,
        gemarkungSchluessel: null,
        flur: fl.flur ? Number(fl.flur) : null,
        zaehler: fl.zaehler ? Number(fl.zaehler) : null,
        nenner: fl.nenner ? Number(fl.nenner) : null,
        officialArea: null,
        borisBodenrichtwert: null,
        borisStichtag: null,
        borisEntwicklungszustand: null,
        borisNutzung: null,
        priceHistoryJson: null,
        geojsonGeometry: null,
        lastFetchedAt: now
      })
    }
  }

  // Update or insert Broker if broker data exists
  if (extracted.broker && (extracted.broker.name || extracted.broker.company || extracted.broker.email || extracted.broker.phone)) {
    const br = extracted.broker
    const existingBroker = await db.query.brokers.findFirst({
      where: eq(schema.brokers.propertyId, propertyId)
    })

    if (existingBroker) {
      await db.update(schema.brokers).set({
        name: br.name || existingBroker.name,
        company: br.company || existingBroker.company,
        email: br.email || existingBroker.email,
        phone: br.phone || existingBroker.phone
      }).where(eq(schema.brokers.id, existingBroker.id))
    } else {
      await db.insert(schema.brokers).values({
        id: 'broker-' + randomUUID().slice(0, 8),
        propertyId,
        name: br.name || null,
        company: br.company || null,
        email: br.email || null,
        phone: br.phone || null,
        website: null
      })
    }
  }

  return { success: true, message: 'Extrahierte Daten erfolgreich übernommen' }
})
