import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lädt Inseratsbilder herunter und legt sie neben den Dokumenten ab.
 *
 * Gespeichert statt verlinkt, weil die Bild-URLs an die Anzeige gebunden sind: Verschwindet
 * das Inserat, sind sie vermutlich weg - und genau dann will man noch sehen, wie das
 * Grundstück aussah.
 *
 * Der Bild-CDN von ImmobilienScout24 ist im Gegensatz zur Hauptseite nicht gesperrt
 * (gemessen: HTTP 200 für eine 1106x830-WebP), der Server kann also selbst laden.
 */

/**
 * Nur bekannte Portal-CDNs. Die URLs kommen aus einem Lesezeichen, das im Browser läuft
 * und manipulierbar wäre - ohne diese Liste könnte der Server zu beliebigen Adressen
 * im lokalen Netz geschickt werden.
 */
const ERLAUBTE_HOSTS = [
  'pictures.immobilienscout24.de',
  'mms.immowelt.de',
  'img.kleinanzeigen.de',
  'i.ebayimg.com',
  'image.immowelt.de'
]

const MAX_BILDER = 20
const MAX_BYTES = 8 * 1024 * 1024

export interface StoredImage {
  /** Pfad relativ zum Projekt, wie bei documents.filePath */
  path: string
  /** Dateiname, unter dem das Bild ausgeliefert wird */
  fileName: string
  bytes: number
}

export function isAllowedImageHost(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ERLAUBTE_HOSTS.some(h => u.host === h || u.host.endsWith('.' + h))
  } catch {
    return false
  }
}

/**
 * Hebt ImmoScout-Bilder auf eine einheitliche Archivgröße. Der CDN nimmt die
 * Umwandlungsparameter im Pfad entgegen (geprüft: 1600x1200 liefert HTTP 200).
 * Bei anderen Portalen bleibt die URL unverändert.
 */
export function normalizeImageUrl(url: string): string {
  const match = url.match(/^(https:\/\/pictures\.immobilienscout24\.de\/listings\/[^/]+)\//)
  if (!match) return url
  return `${match[1]}/ORIG/resize/1600x1200%3E/format/webp/quality/85`
}

/** Identität eines Bildes unabhängig von der Größenvariante - gegen Dubletten. */
function imageIdentity(url: string): string {
  const match = url.match(/\/listings\/([^/]+)/)
  return match ? match[1] : url
}

export async function storeImages(propertyId: string, urls: string[]): Promise<StoredImage[]> {
  const gesehen = new Set<string>()
  const kandidaten: string[] = []

  for (const roh of urls) {
    if (!roh || typeof roh !== 'string') continue
    const url = normalizeImageUrl(roh.trim())
    if (!isAllowedImageHost(url)) continue

    const id = imageIdentity(url)
    if (gesehen.has(id)) continue
    gesehen.add(id)
    kandidaten.push(url)
    if (kandidaten.length >= MAX_BILDER) break
  }

  if (kandidaten.length === 0) return []

  const zielOrdner = join(process.cwd(), 'storage', 'images', propertyId)
  mkdirSync(zielOrdner, { recursive: true })

  const gespeichert: StoredImage[] = []

  for (const url of kandidaten) {
    try {
      const antwort = await fetch(url, {
        headers: { Accept: 'image/webp,image/jpeg,image/png,*/*' },
        signal: AbortSignal.timeout(20000)
      })
      if (!antwort.ok) continue

      const typ = antwort.headers.get('content-type') || ''
      if (!typ.startsWith('image/')) continue

      const daten = Buffer.from(await antwort.arrayBuffer())
      if (daten.length === 0 || daten.length > MAX_BYTES) continue

      const endung = typ.includes('webp') ? 'webp' : typ.includes('png') ? 'png' : 'jpg'
      const name = createHash('sha256').update(imageIdentity(url)).digest('hex').slice(0, 16) + '.' + endung
      const vollerPfad = join(zielOrdner, name)

      // Dasselbe Bild nicht erneut laden, wenn es schon liegt.
      if (!existsSync(vollerPfad)) writeFileSync(vollerPfad, daten)

      gespeichert.push({
        path: join('storage', 'images', propertyId, name),
        fileName: name,
        bytes: daten.length
      })
    } catch (err: any) {
      console.warn(`[Bilder] ${url.slice(0, 60)}… konnte nicht geladen werden: ${err.message}`)
    }
  }

  return gespeichert
}
