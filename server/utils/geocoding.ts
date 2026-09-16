import { fetchFromGeobasis } from './geobasis'

export function generateAddressVariants(raw: string): string[] {
  const variants: string[] = []
  const trimmed = raw.trim()
  if (!trimmed) return variants

  variants.push(trimmed)

  // 1. Remove (Kreis), Landkreis, etc. e.g. ", Oder-Spree (Kreis)"
  const noKreis = trimmed
    .replace(/,\s*[^,]+(?:\(Kreis\)|\(Landkreis\))/gi, '')
    .replace(/\([^)]*kreis[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (noKreis && noKreis !== trimmed) variants.push(noKreis)

  // 2. Remove all parentheses like "(Mark)" or "(15859)"
  const noParens = (noKreis || trimmed).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  if (noParens && noParens !== noKreis && noParens !== trimmed) variants.push(noParens)

  // 3. Remove house number if present to match street
  const baseForStreet = noParens || noKreis || trimmed
  if (baseForStreet.includes(',')) {
    const parts = baseForStreet.split(',')
    const streetWithoutNum = parts[0].replace(/\s+\d+[a-zA-Z]?$/, '').trim()
    if (streetWithoutNum && streetWithoutNum !== parts[0].trim()) {
      parts[0] = streetWithoutNum
      variants.push(parts.join(',').trim())
    }
  }

  // 4. PLZ + City e.g. '15859 Storkow'
  const plzMatch = (noParens || trimmed).match(/(\b\d{5}\b\s+[^,]+)/)
  if (plzMatch) {
    const plzCity = plzMatch[1].trim()
    if (!variants.includes(plzCity)) variants.push(plzCity)
    
    // 5. City only + Brandenburg
    const cityOnly = plzCity.replace(/^\d{5}\s+/, '').trim()
    if (cityOnly && !variants.includes(cityOnly)) {
      variants.push(cityOnly + ', Brandenburg')
    }
  }

  return Array.from(new Set(variants.filter(Boolean)))
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; displayName?: string } | null> {
  if (!address || !address.trim()) return null

  const variants = generateAddressVariants(address)

  // 1. Try Geobasis daemon for each variant
  for (const variant of variants) {
    try {
      const geoRes = await fetchFromGeobasis('/api/search', {
        query: variant,
        limit: 3,
        category: 'all'
      })

      const results = geoRes?.results || geoRes?.features || []
      for (const r of results) {
        const geom = r.geometry || r.categoryResult?.position
        if (typeof geom === 'string' && geom.startsWith('POINT(')) {
          const parts = geom.replace('POINT(', '').replace(')', '').trim().split(/\s+/)
          if (parts.length >= 2) {
            const lng = parseFloat(parts[0])
            const lat = parseFloat(parts[1])
            if (!isNaN(lat) && !isNaN(lng)) {
              return { lat, lng, displayName: r.title || r.text }
            }
          }
        }
      }
    } catch {}
  }

  // 2. Fallback: OpenStreetMap Nominatim for each variant
  for (const variant of variants) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(variant)}&format=json&limit=1`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'ImmoDB-App/1.0',
          'Accept-Language': 'de-DE,de;q=0.9'
        },
        signal: AbortSignal.timeout(5000)
      })

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const lat = parseFloat(data[0].lat)
          const lng = parseFloat(data[0].lon)
          if (!isNaN(lat) && !isNaN(lng)) {
            return {
              lat,
              lng,
              displayName: data[0].display_name
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Geocoding] Nominatim lookup failed for "${variant}":`, err.message)
    }
  }

  return null
}
