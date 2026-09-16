import * as cheerio from 'cheerio'
import { getGeminiClient, getGeminiModel } from './gemini'
import { detectBlockPage } from './botWall'

export async function extractPropertyFromHtml(html: string, originalUrl: string) {
  // Zweites Netz: falls doch eine Schutz- oder Fehlerseite bis hierher kommt,
  // soll daraus kein Grundstück mit erfundenem Titel entstehen.
  const blocked = detectBlockPage(html, undefined, originalUrl)
  if (blocked.blocked) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Inserat nicht lesbar',
      message: `${blocked.reason} - es konnten keine Inseratsdaten gelesen werden.`
    })
  }

  const $ = cheerio.load(html)

  // 1. Extract JSON-LD scripts (many real estate sites put structured data here)
  const jsonLdData: any[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).text()
      if (content.trim()) {
        jsonLdData.push(JSON.parse(content))
      }
    } catch {}
  })

  // 2. Extract OpenGraph & Meta tags
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim()
  const ogDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || ''
  const ogImg = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content')
  
  // 3. Extract Images from meta, json-ld and img tags before cleaning DOM
  const rawImages: string[] = []
  if (ogImg && ogImg.startsWith('http')) {
    rawImages.push(ogImg)
  }

  for (const ld of jsonLdData) {
    if (ld.image) {
      if (typeof ld.image === 'string' && ld.image.startsWith('http')) {
        rawImages.push(ld.image)
      } else if (Array.isArray(ld.image)) {
        for (const img of ld.image) {
          const u = typeof img === 'string' ? img : img?.url || img?.contentUrl
          if (u && typeof u === 'string' && u.startsWith('http')) rawImages.push(u)
        }
      } else if (typeof ld.image === 'object' && ld.image.url) {
        rawImages.push(ld.image.url)
      }
    }
  }

  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('data-lazy-src')
    if (src && typeof src === 'string') {
      const full = src.startsWith('//') ? 'https:' + src : src
      const lower = full.toLowerCase()
      if (
        full.startsWith('http') &&
        !lower.endsWith('.svg') &&
        !lower.includes('.svg?') &&
        !lower.includes('pixel') &&
        !lower.includes('tracking') &&
        !lower.includes('analytics') &&
        !lower.includes('logo') &&
        !lower.includes('avatar') &&
        !lower.includes('profil') &&
        !lower.includes('partner-badge') &&
        !lower.includes('badge') &&
        !lower.includes('icon') &&
        !lower.includes('/map/') &&
        !lower.includes('address-map') &&
        !lower.includes('travel-time') &&
        !lower.includes('placeholder')
      ) {
        rawImages.push(full)
      }
    }
  })

  const extractedImages = Array.from(new Set(rawImages)).slice(0, 15)
  const primaryImageUrl = extractedImages[0] || null

  // 4. Clean page to reduce token usage: remove scripts, styles, SVGs, navbars, footers
  $('script, style, noscript, svg, iframe, nav, footer, header').remove()

  // Grab text from body
  const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 12000).trim()

  const client = getGeminiClient()
  const modelName = getGeminiModel()

  if (!client) {
    // Basic heuristic fallback when Gemini API key is not configured
    let fallbackPrice: number | null = null
    let fallbackArea: number | null = null

    // Look for price patterns like 350.000 € or 350000 €
    const priceMatch = bodyText.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:€|EUR)/i)
    if (priceMatch) {
      fallbackPrice = parseInt(priceMatch[1].replace(/\./g, ''), 10)
    }

    // Look for area patterns like 650 m² or 650 qm
    const areaMatch = bodyText.match(/(\d{2,5})\s*(?:m²|qm|Quadratmeter)/i)
    if (areaMatch) {
      fallbackArea = parseInt(areaMatch[1], 10)
    }

    return {
      isSimulated: true,
      title: ogTitle.slice(0, 100) || 'Grundstück aus Inserat',
      address: '',
      askingPrice: fallbackPrice,
      areaSqm: fallbackArea,
      pricePerSqm: fallbackPrice && fallbackArea ? Math.round(fallbackPrice / fallbackArea) : null,
      buildingLaw: '',
      grz: null,
      gfz: null,
      developmentStatus: '',
      adUrl: originalUrl,
      notes: ogDescription || 'Automatisch importiert aus URL (Heuristik aktiv, da kein GEMINI_API_KEY).',
      primaryImageUrl,
      images: extractedImages,
      broker: {
        name: null,
        company: null,
        email: null,
        phone: null
      },
      flurstueck: {
        gemarkung: null,
        flur: null,
        zaehler: null,
        nenner: null
      }
    }
  }

  const prompt = `Du bist ein präziser Extraktor für Immobilien- und Grundstücksdaten.
Analysiere die folgenden Daten einer Immobilien-Webseite (Inserat-URL: ${originalUrl}):

Metadaten & JSON-LD:
${JSON.stringify({ title: ogTitle, description: ogDescription, jsonLd: jsonLdData }, null, 2)}

Seiteninhalt (bereinigt):
${bodyText}

Extrahiere die Grundstücks- und Maklerangaben.
Antworte AUSSCHLIESSLICH im folgenden gültigen JSON-Format (keine Markdown-Codeblöcke, nur reines JSON):
{
  "title": "Aussagekräftiger deutscher Titel des Grundstücks",
  "address": "Straße, Hausnummer, PLZ, Ort (falls im Text vorhanden, sonst Ort)",
  "askingPrice": 250000 (Zahl in Euro oder null),
  "areaSqm": 700 (Fläche in qm als Zahl oder null),
  "pricePerSqm": 357 (Zahl oder null),
  "buildingLaw": "z. B. B-Plan, §34 BauGB oder Außenbereich (oder leer)",
  "grz": 0.2 (Grundflächenzahl als Dezimalzahl oder null),
  "gfz": 0.4 (Geschossflächenzahl als Dezimalzahl oder null),
  "developmentStatus": "voll erschlossen / teilerschlossen / unerschlossen (oder leer)",
  "notes": "2-3 Sätze Zusammenfassung der wesentlichen Highlights, Beschaffenheit und Auflagen aus dem Inserat",
  "broker": {
    "name": "Name des Maklers / Ansprechpartners oder null",
    "company": "Firma / Maklerbüro oder null",
    "email": "E-Mail oder null",
    "phone": "Telefonnummer oder null"
  },
  "flurstueck": {
    "gemarkung": "Name der Gemarkung falls genannt oder null",
    "flur": 1 (Zahl oder null),
    "zaehler": 123 (Zahl oder null),
    "nenner": null
  }
}`

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    })

    const text = response.text || ''
    let parsed: any = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
      parsed = JSON.parse(cleaned)
    }

    const result = {
      isSimulated: false,
      adUrl: originalUrl,
      primaryImageUrl,
      images: extractedImages,
      ...parsed
    }

    return { ...result, warning: plausibilityWarning(result) }
  } catch (err: any) {
    if (err?.statusCode) throw err
    console.error('Gemini URL Extractor Error:', err)

    // Die KI ist ausgefallen - Bilder und Metadaten sind trotzdem verwertbar,
    // aber das muss sichtbar sein statt als vollständiger Import durchzugehen.
    return {
      isSimulated: false,
      adUrl: originalUrl,
      title: ogTitle || 'Grundstück',
      address: '',
      askingPrice: null,
      areaSqm: null,
      primaryImageUrl,
      images: extractedImages,
      notes: ogDescription || '',
      warning: `Die KI-Auswertung ist fehlgeschlagen (${err.message}). Übernommen wurden nur Titel, Beschreibung und Bilder - bitte Preis, Fläche und Baurecht von Hand ergänzen.`
    }
  }
}

/**
 * Eine Seite kann technisch abrufbar sein und trotzdem nichts Verwertbares liefern -
 * etwa bei einer Suchergebnis- statt Detailseite oder einem gelöschten Inserat.
 * Dann ist ein stiller "Erfolg" irreführend.
 */
function plausibilityWarning(data: any): string | undefined {
  const hasNumbers = !!(data.askingPrice || data.areaSqm)
  const hasLocation = !!(data.address && String(data.address).trim())
  const hasImages = Array.isArray(data.images) && data.images.length > 0

  if (!hasNumbers && !hasLocation && !hasImages) {
    return 'Aus dieser Seite ließen sich weder Preis noch Fläche, Adresse oder Bilder lesen. Prüfe, ob die URL direkt auf das Exposé zeigt (nicht auf eine Suchergebnisliste) und ob das Inserat noch online ist.'
  }
  if (!hasNumbers) {
    return 'Preis und Fläche konnten nicht gelesen werden - bitte von Hand ergänzen.'
  }
  return undefined
}
