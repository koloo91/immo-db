import { getDatabase, schema } from '../../database'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = getDatabase()

  const properties = await db.query.properties.findMany({
    orderBy: [desc(schema.properties.updatedAt)],
    with: {
      parcel: true,
      broker: true,
      listingStatus: true,
      checklistItems: true,
      analyses: {
        orderBy: [desc(schema.propertyAnalyses.createdAt)],
        limit: 1
      }
    }
  })

  // Check if any property with address is missing coordinates
  const missingGeo = properties.filter(p => (!p.latitude || !p.longitude) && p.address)
  if (missingGeo.length > 0) {
    const { geocodeAddress } = await import('../../utils/geocoding')
    const { eq } = await import('drizzle-orm')
    for (const p of missingGeo) {
      const geo = await geocodeAddress(p.address!)
      if (geo) {
        p.latitude = geo.lat
        p.longitude = geo.lng
        await db.update(schema.properties)
          .set({ latitude: geo.lat, longitude: geo.lng })
          .where(eq(schema.properties.id, p.id))
      }
    }
  }

  // Die jeweils neueste Bewertung flach danebenlegen, damit Kanban und
  // Vergleichsmatrix den Score ohne Zusatzabfrage anzeigen können.
  return properties.map(p => ({
    ...p,
    latestAnalysis: p.analyses?.[0] || null
  }))
})
