import * as cheerio from 'cheerio'

export type Portal = 'immowelt' | 'kleinanzeigen' | 'immoscout24' | 'sonstiges'

export interface ListingReading {
  /** Konnte die Seite überhaupt ausgewertet werden? */
  ok: boolean
  title: string | null
  price: number | null
  /** true nur, wenn die Seite das Verschwinden ausdrücklich sagt. */
  gone: boolean
  reason: string
}

export function detectPortal(url: string): Portal {
  try {
    const host = new URL(url).host.toLowerCase()
    if (host.includes('immowelt')) return 'immowelt'
    if (host.includes('kleinanzeigen') || host.includes('ebay-kleinanzeigen')) return 'kleinanzeigen'
    if (host.includes('immobilienscout24')) return 'immoscout24'
  } catch {}
  return 'sonstiges'
}

export const PORTAL_LABELS: Record<Portal, string> = {
  immowelt: 'immowelt',
  kleinanzeigen: 'Kleinanzeigen',
  immoscout24: 'ImmobilienScout24',
  sonstiges: 'Portal'
}

/**
 * Merkmale, an denen eine echte Inseratsseite erkennbar ist. Fehlen sie alle, wurde
 * vermutlich auf eine Übersichts- oder Startseite umgeleitet.
 */
const LISTING_MARKERS: Record<Portal, string[]> = {
  kleinanzeigen: ['#viewad-title', '#viewad-price', '#viewad-description', '.boxedarticle'],
  immowelt: ['[data-testid="aviv.CDP.Sections.Hardfacts"]', '#expose', '.expose', '[class*="Hardfacts"]'],
  immoscout24: ['#expose-title', '.is24qa-kaufpreis', '#expose'],
  sonstiges: []
}

function isListingPage($: cheerio.CheerioAPI, portal: Portal): boolean {
  const markers = LISTING_MARKERS[portal]
  if (markers.length === 0) return true // unbekanntes Portal: nicht vorschnell verwerfen

  if (markers.some(selector => $(selector).length > 0)) return true

  // Zweite Chance: ein RealEstateListing im JSON-LD ist ebenfalls ein sicheres Zeichen.
  return jsonLdNodes($).some(node => {
    const type = node?.['@type']
    const types = Array.isArray(type) ? type : [type]
    return types.some(t => typeof t === 'string' && /Listing|Product|Offer|Residence|Place/i.test(t))
  })
}

/**
 * Formulierungen, mit denen Portale ein entferntes Inserat kennzeichnen.
 * Nur hierauf wird sofort "offline" gemeldet - alles andere läuft über den
 * Strukturbruch-Vergleich im Job und braucht eine zweite Bestätigung.
 */
const GONE_PHRASES = [
  'anzeige gelöscht',
  'anzeige wurde gelöscht',
  'anzeige ist nicht mehr verfügbar',
  'angebot wurde entfernt',
  'angebot ist nicht mehr verfügbar',
  'objekt nicht mehr verfügbar',
  'immobilie nicht mehr verfügbar',
  'inserat nicht mehr verfügbar',
  'diese anzeige existiert nicht',
  'anzeige nicht gefunden'
]

/**
 * Liest Titel und Preis aus der Inseratsseite.
 *
 * Bewusst portalspezifisch: gemessen liegt der Preis bei immowelt im JSON-LD bzw. og:title
 * ("Grundstück 135000 € zum Kauf Storkow"), bei Kleinanzeigen dagegen ausschließlich im DOM
 * unter #viewad-price - dort führen JSON-LD und og:title nichts Verwertbares.
 *
 * Wenn nichts sicher gelesen werden kann, ist das Ergebnis `ok: false`. Geraten wird nicht:
 * ein falscher Preis wandert sonst in Vergleich, Score und Nebenkostenrechnung.
 */
export function readListing(html: string, portal: Portal): ListingReading {
  const $ = cheerio.load(html)
  const haystack = $('body').text().toLowerCase().slice(0, 40000)

  const phrase = GONE_PHRASES.find(p => haystack.includes(p))
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null
  const rawTitle = ogTitle || $('title').text().trim() || null

  if (phrase) {
    return { ok: true, title: rawTitle, price: null, gone: true, reason: `Seite meldet: „${phrase}"` }
  }

  // Ein entferntes Inserat leitet bei manchen Portalen auf Start- oder Kategorieseite um.
  // Deren Titel ist vorhanden, gehört aber nicht zum Inserat - ohne diese Prüfung sähe
  // ein verschwundenes Inserat dauerhaft "online" aus.
  if (!isListingPage($, portal)) {
    return {
      ok: true,
      title: null,
      price: null,
      gone: false,
      reason: 'Seite ist keine Inseratsseite (vermutlich Umleitung)'
    }
  }

  const title = rawTitle

  const price = portal === 'kleinanzeigen'
    ? readKleinanzeigenPrice($)
    : portal === 'immowelt'
      ? readImmoweltPrice($, ogTitle)
      : readGenericPrice($, ogTitle)

  if (!title && price === null) {
    // Seite kam an, gab aber nichts her. Ob das "gelöscht" heißt, entscheidet der
    // Vergleich mit dem letzten erfolgreichen Abruf - nicht dieser Parser.
    return { ok: true, title: null, price: null, gone: false, reason: 'Weder Titel noch Preis lesbar' }
  }

  return {
    ok: true,
    title,
    price,
    gone: false,
    reason: price === null ? 'Titel gelesen, Preis nicht gefunden' : 'Titel und Preis gelesen'
  }
}

/** immowelt: Preis steckt im JSON-LD-Namen bzw. im og:title ("… 135000 € zum Kauf …"). */
function readImmoweltPrice($: cheerio.CheerioAPI, ogTitle: string | null): number | null {
  for (const node of jsonLdNodes($)) {
    const name = typeof node?.name === 'string' ? node.name : null
    const fromName = name ? parsePrice(name) : null
    if (fromName !== null) return fromName

    const offerPrice = node?.offers?.price ?? node?.offers?.[0]?.price
    if (offerPrice !== undefined && offerPrice !== null) {
      const n = Number(String(offerPrice).replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return ogTitle ? parsePrice(ogTitle) : null
}

/** Kleinanzeigen: nur im DOM - gemessen liefern JSON-LD und og:title dort keinen Preis. */
function readKleinanzeigenPrice($: cheerio.CheerioAPI): number | null {
  for (const selector of ['#viewad-price', '.boxedarticle--price', '[data-testid="ad-price"]']) {
    const text = $(selector).first().text().trim()
    const price = text ? parsePrice(text) : null
    if (price !== null) return price
  }
  return null
}

function readGenericPrice($: cheerio.CheerioAPI, ogTitle: string | null): number | null {
  const meta = $('meta[property="product:price:amount"]').attr('content')
  if (meta) {
    const n = Number(meta.replace(/[^\d.]/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }

  for (const node of jsonLdNodes($)) {
    const offerPrice = node?.offers?.price ?? node?.offers?.[0]?.price ?? node?.price
    if (offerPrice !== undefined && offerPrice !== null) {
      const n = Number(String(offerPrice).replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  // Bewusst NICHT im Fließtext suchen: auf derselben immowelt-Seite stehen
  // 135.000 € (Kaufpreis) und 139.820 € (inkl. Nebenkosten) nebeneinander.
  return ogTitle ? parsePrice(ogTitle) : null
}

function jsonLdNodes($: cheerio.CheerioAPI): any[] {
  const nodes: any[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text())
      for (const node of (Array.isArray(parsed) ? parsed : [parsed])) {
        if (node && typeof node === 'object') nodes.push(node)
      }
    } catch {}
  })
  return nodes
}

/**
 * Zieht einen Eurobetrag aus einem Text. Erkennt "135000 €", "135.000 €" und "135.000,50 €".
 * Beträge unter 1000 € werden verworfen - ein Grundstück kostet keine 3 €, und genau so
 * ein Wert stünde sonst aus einer Nebenangabe im Datensatz.
 */
export function parsePrice(text: string): number | null {
  const matches = String(text).matchAll(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,})(?:,(\d{1,2}))?\s*(?:€|EUR|Euro)/gi)
  for (const match of matches) {
    const whole = Number(match[1].replace(/[.\s]/g, ''))
    if (Number.isFinite(whole) && whole >= 1000) {
      return match[2] ? Number(`${whole}.${match[2]}`) : whole
    }
  }
  return null
}
