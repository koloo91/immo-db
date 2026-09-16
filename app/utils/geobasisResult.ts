/**
 * Auswertung der Trefferliste des geobasis-Dienstes.
 *
 * Die Suche liefert DREI Ergebnisarten nebeneinander, mit unterschiedlich geformten IDs
 * (an der laufenden Instanz gemessen):
 *
 *   gemarkung    121444                  6-stellig, Gemarkungsschlüssel
 *   flur         121471005               9-stellig
 *   flurstueck   12144400200591______    20-stellig, das amtliche Kennzeichen
 *
 * Nur die dritte Art ist ein Flurstück. Vorher wurde jede ID ungeprüft ins Feld
 * "Flurstückskennzeichen" geschrieben - wer eine Gemarkung anklickte, bekam deren
 * Schlüssel als vermeintliches Kennzeichen, und alle Folgeabfragen liefen ins Leere.
 */

export type GeoResultType = 'flurstueck' | 'flur' | 'gemarkung' | 'unbekannt'

export interface GeoResult {
  id?: string
  title?: string
  categoryResult?: { type?: string, typeLabel?: string }
  administrative?: Record<string, any>
  properties?: Record<string, any>
}

export function resultType(res: GeoResult): GeoResultType {
  const typ = res?.categoryResult?.type
  if (typ === 'flurstueck' || typ === 'flur' || typ === 'gemarkung') return typ

  // Rückfall über die Form der ID, falls der Dienst den Typ einmal nicht mitliefert.
  const id = String(res?.id || res?.properties?.flstkennz || '')
  if (id.length === 20) return 'flurstueck'
  if (id.length === 9) return 'flur'
  if (id.length === 6) return 'gemarkung'
  return 'unbekannt'
}

export function isParcel(res: GeoResult): boolean {
  return resultType(res) === 'flurstueck'
}

/** 20-stelliges Kennzeichen - nur bei echten Flurstücken vorhanden. */
export function parcelKey(res: GeoResult): string | null {
  if (!isParcel(res)) return null
  const key = res?.properties?.flstkennz || res?.id
  return key ? String(key) : null
}

export const TYPE_LABELS: Record<GeoResultType, string> = {
  flurstueck: 'Flurstück',
  flur: 'Flur',
  gemarkung: 'Gemarkung',
  unbekannt: 'Treffer'
}

/** Zweite Zeile im Suchergebnis: Kreis, Gemeinde, Kennzeichen. */
export function resultSubtitle(res: GeoResult): string {
  const teile: string[] = []
  const adm = res?.administrative || {}

  // Bei mehrdeutigen Gemarkungen ALLE Gemeinden nennen: "Kummersdorf" liegt sowohl bei
  // Storkow als auch bei Heidesee. Nur die erste zu zeigen führte in die Irre - genau die
  // Gemeinde, die man sucht, konnte dabei unter den Tisch fallen.
  const gemeinden = alle(adm.assignMunicipality, res?.properties?.gemeinde)
  const kreise = alle(adm.assignDistrict, res?.properties?.kreis)
  if (gemeinden.length) teile.push(gemeinden.slice(0, 3).join(' / '))
  const kreisText = kreise.filter(k => !gemeinden.includes(k)).slice(0, 2).join(' / ')
  if (kreisText) teile.push(kreisText)

  if (isParcel(res)) {
    const key = parcelKey(res)
    if (key) teile.push(key)
  }
  return teile.join(' · ')
}

/**
 * Zeigt ein Mehrfach-Vorkommen an: "Kummersdorf" gibt es in Brandenburg zweimal,
 * bei Storkow und bei Heidesee. Ohne diesen Hinweis wirken die Treffer wie Dubletten.
 */
export function isAmbiguous(res: GeoResult): boolean {
  const adm = res?.administrative || {}
  return Array.isArray(adm.assignMunicipality) && adm.assignMunicipality.length > 1
}

function alle(value: any, rueckfall?: any): string[] {
  const liste = Array.isArray(value) ? value : (value ? [value] : [])
  const ergebnis = liste.map(String).filter(Boolean)
  if (ergebnis.length === 0 && rueckfall) return [String(rueckfall)]
  return ergebnis
}

export interface ParcelDetails {
  flstkennz: string
  gemarkungName?: string
  gemarkungSchluessel?: string
  flur?: number | null
  zaehler?: number | null
  nenner?: number | null
  officialArea?: number | null
  lagebezeichnung?: string
  gemeinde?: string
  kreis?: string
  geojsonGeometry?: any
  borisBodenrichtwert?: number | null
  borisStichtag?: string | null
  priceHistory?: any
}

/**
 * Holt die amtlichen Werte zu einem Kennzeichen. Bewusst über die Detailabfrage statt
 * aus dem Suchtreffer geraten: dort stehen Gemarkung, Flur, Zähler und Fläche
 * strukturiert und verlässlich.
 */
export async function loadParcelDetails(flstkennz: string): Promise<ParcelDetails> {
  const details: ParcelDetails = { flstkennz }

  try {
    const feature = await $fetch<any>(`/api/geobasis/flurstueck/${encodeURIComponent(flstkennz)}`)
    const p = feature?.properties || {}
    details.gemarkungName = p.gemarkung || undefined
    details.gemarkungSchluessel = p.gemaschl || undefined
    details.flur = p.flur !== undefined && p.flur !== null ? Number(p.flur) : null
    details.zaehler = p.flstnrzae !== undefined && p.flstnrzae !== null ? Number(p.flstnrzae) : null
    details.nenner = p.flstnrnen !== undefined && p.flstnrnen !== null && p.flstnrnen !== '' ? Number(p.flstnrnen) : null
    details.officialArea = p.flaeche !== undefined && p.flaeche !== null ? Number(p.flaeche) : null
    details.lagebezeichnung = p.lagebeztxt || undefined
    details.gemeinde = p.gemeinde || undefined
    details.kreis = p.kreis || undefined
    if (feature?.geometry) details.geojsonGeometry = feature.geometry
  } catch (err: any) {
    console.warn('Flurstücksdetails nicht abrufbar:', err?.message)
  }

  try {
    const preise = await $fetch<any>(`/api/geobasis/flurstueck/${encodeURIComponent(flstkennz)}/preise`)
    if (preise?.currentPrice?.bodenrichtwert) {
      details.borisBodenrichtwert = preise.currentPrice.bodenrichtwert
      details.borisStichtag = preise.currentPrice.stichtag || null
    }
    if (preise?.history) details.priceHistory = preise.history
  } catch {}

  return details
}
