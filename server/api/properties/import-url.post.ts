import { fetchHtmlWithFlareSolverr } from '../../utils/flaresolverr'
import { extractPropertyFromHtml } from '../../utils/urlExtractor'
import { geocodeAddress } from '../../utils/geocoding'
import { normalizeListingUrl } from '../../utils/botWall'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL ist erforderlich'
    })
  }

  let validUrl: URL
  try {
    validUrl = new URL(body.url)
    if (!['http:', 'https:'].includes(validUrl.protocol)) {
      throw new Error('Ungültiges Protokoll')
    }
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Webseiten-URL (muss mit http:// oder https:// beginnen)'
    })
  }

  // Tracking-Parameter und "#/"-Fragmente aus geteilten Portal-Links entfernen
  const cleanUrl = normalizeListingUrl(validUrl.toString())

  // 1. Fetch HTML (via FlareSolverr or direct fallback)
  const { html, method } = await fetchHtmlWithFlareSolverr(cleanUrl)

  // 2. Extract structured data with Gemini
  const extracted = await extractPropertyFromHtml(html, cleanUrl)

  // 3. Auto-geocode extracted address
  if (extracted.address) {
    const geo = await geocodeAddress(extracted.address)
    if (geo) {
      extracted.latitude = geo.lat
      extracted.longitude = geo.lng
    }
  }

  return {
    success: true,
    method, // 'flaresolverr' | 'direct'
    warning: (extracted as any).warning || null,
    data: extracted
  }
})
