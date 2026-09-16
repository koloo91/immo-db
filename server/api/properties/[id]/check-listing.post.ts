import { checkListing } from '../../../jobs/checkListing'

/**
 * "Jetzt prüfen" - vom Nutzer ausgelöst, deshalb mit den vollen Wiederholungen
 * (scheduled: false). Hier wartet jemand auf ein Ergebnis.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const result = await checkListing(propertyId, { scheduled: false })
  return { success: true, ...result }
})
