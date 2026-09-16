import { getDatabase, schema } from '../../../database'
import { eq, asc, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID erforderlich' })
  }

  const db = getDatabase()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, id),
    with: {
      parcel: true,
      broker: true,
      listingStatus: true,
      communications: {
        orderBy: [desc(schema.communications.createdAt)],
        with: { attachments: true }
      },
      emailThreads: {
        orderBy: [desc(schema.emailThreads.lastMessageAt)],
        with: {
          messages: {
            orderBy: [asc(schema.communications.occurredAt)],
            with: { attachments: true }
          }
        }
      },
      checklistItems: {
        orderBy: [asc(schema.checklistItems.category)]
      },
      documents: {
        orderBy: [desc(schema.documents.createdAt)],
        with: { communication: true }
      },
      documentChats: {
        orderBy: [asc(schema.documentChats.createdAt)]
      },
      analyses: {
        orderBy: [desc(schema.propertyAnalyses.createdAt)]
      },
      priceObservations: {
        orderBy: [desc(schema.priceObservations.observedAt)]
      }
    }
  })

  if (!property) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Grundstück nicht gefunden'
    })
  }

  // Auto-geocode on the fly if coordinates missing but address is present
  if ((!property.latitude || !property.longitude) && property.address) {
    const { geocodeAddress } = await import('../../../utils/geocoding')
    const geo = await geocodeAddress(property.address)
    if (geo) {
      property.latitude = geo.lat
      property.longitude = geo.lng
      await db.update(schema.properties)
        .set({ latitude: geo.lat, longitude: geo.lng, updatedAt: Date.now() })
        .where(eq(schema.properties.id, id))
    }
  }

  return property
})
