import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../database'
import { fetchHtmlWithFlareSolverr } from '../utils/flaresolverr'
import { normalizeListingUrl } from '../utils/botWall'
import { readListing, detectPortal, PORTAL_LABELS, type Portal } from '../utils/listingCheck'

export interface CheckResult {
  propertyId: string
  state: 'online' | 'suspect' | 'offline' | 'unverifiable'
  price: number | null
  priceChanged: boolean
  message: string
}

/**
 * Prüft ein Inserat und schreibt Status sowie - nur bei Veränderung - einen Historieneintrag.
 *
 * Kernregel: Ein fehlgeschlagener Abruf sagt NICHTS über das Inserat aus. Bot-Wall und
 * gelöschtes Inserat liefern byte-identische HTTP-Antworten (gemessen: immowelt 403/771 B,
 * ImmoScout 401/4006 B - jeweils identisch für echt und erfunden). Deshalb führt
 * "nicht abrufbar" zu `unverifiable` und niemals zu einer Offline-Meldung.
 */
export async function checkListing(propertyId: string, opts: { scheduled?: boolean } = {}): Promise<CheckResult> {
  const db = getDatabase()
  const now = Date.now()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: { listingStatus: true }
  })

  if (!property?.adUrl) {
    return { propertyId, state: 'unverifiable', price: null, priceChanged: false, message: 'Keine Inserat-URL hinterlegt' }
  }

  const url = normalizeListingUrl(property.adUrl)
  const portal = detectPortal(url)
  const status = (property as any).listingStatus || null

  await ensureStatusRow(propertyId, portal)

  // --- Abruf --------------------------------------------------------------
  let html: string
  try {
    const fetched = await fetchHtmlWithFlareSolverr(url, { singleAttempt: opts.scheduled })
    html = fetched.html
  } catch (err: any) {
    const message = err.message || err.statusMessage || 'Abruf fehlgeschlagen'
    await db.update(schema.listingStatus).set({
      state: 'unverifiable',
      lastCheckedAt: now,
      lastMessage: message,
      consecutiveFailures: (status?.consecutiveFailures || 0) + 1
    }).where(eq(schema.listingStatus.propertyId, propertyId))

    // Bei Portalen mit bekannter Wall ist das der erwartete Zustand, kein Zwischenfall.
    if (portal !== 'immoscout24') {
      console.warn(`[Inserat] ${property.title}: nicht prüfbar - ${message.slice(0, 120)}`)
    }
    return { propertyId, state: 'unverifiable', price: null, priceChanged: false, message }
  }

  // --- Auswertung ---------------------------------------------------------
  const reading = readListing(html, portal)
  const hadDataBefore = !!(status?.lastSeenTitle || status?.lastSeenPrice)
  const structuralBreak = !reading.gone && !reading.title && reading.price === null && hadDataBefore

  let state: CheckResult['state'] = 'online'
  let suspectSince: number | null = status?.suspectSince ?? null

  if (reading.gone) {
    state = 'offline'
  } else if (structuralBreak) {
    // Erst beim zweiten Mal in Folge melden - eine einmalige Portalstörung
    // soll keinen Fehlalarm auslösen.
    state = status?.state === 'suspect' ? 'offline' : 'suspect'
    if (state === 'suspect') suspectSince = suspectSince ?? now
  }

  const wasGone = status?.state === 'offline' || status?.state === 'suspect'
  const isGone = state === 'offline' || state === 'suspect'

  const updates: Record<string, any> = {
    state,
    lastCheckedAt: now,
    lastOkAt: now,
    lastMessage: reading.reason,
    consecutiveFailures: 0,
    suspectSince: state === 'suspect' ? suspectSince : null,
    firstSeenAt: status?.firstSeenAt ?? now
  }

  // Gedächtnis nur fortschreiben, wenn wirklich etwas gelesen wurde - sonst
  // würde der Strukturbruch-Vergleich seine eigene Grundlage löschen.
  if (reading.title) updates.lastSeenTitle = reading.title
  if (reading.price !== null) updates.lastSeenPrice = reading.price

  // --- Historie: nur bei Veränderung --------------------------------------
  const observations: any[] = []
  const observe = (kind: string, extra: Record<string, any> = {}) => observations.push({
    id: 'obs-' + randomUUID().slice(0, 8),
    propertyId,
    observedAt: now,
    kind,
    source: 'auto',
    ...extra
  })

  if (!status?.firstSeenAt) {
    observe('first_seen', {
      price: reading.price,
      pricePerSqm: perSqm(reading.price, property.areaSqm),
      note: `Erstmals erfasst über ${PORTAL_LABELS[portal]}`
    })
  }

  if (state === 'offline' && status?.state !== 'offline') {
    observe('listing_gone', { note: reading.gone ? reading.reason : 'Inserat liefert keine Daten mehr' })
  }
  if (!isGone && wasGone) {
    observe('listing_back', { price: reading.price, note: 'Inserat wieder erreichbar' })
  }

  let priceChanged = false
  if (reading.price !== null && state === 'online') {
    const known = property.askingPrice ?? null
    if (known !== null && Math.round(reading.price) !== Math.round(known)) {
      priceChanged = true
      updates.pendingPrice = reading.price
      updates.pendingPriceSeenAt = now
      updates.alertAckAt = null
      observe('price_change', {
        price: reading.price,
        previousPrice: known,
        pricePerSqm: perSqm(reading.price, property.areaSqm),
        note: `Inserat nennt ${reading.price.toLocaleString('de-DE')} €`
      })
    } else if (known !== null && status?.pendingPrice && Math.round(status.pendingPrice) === Math.round(known)) {
      // Vorschlag wurde übernommen - Meldung räumen.
      updates.pendingPrice = null
      updates.pendingPriceSeenAt = null
    }
  }

  if (isGone && !wasGone) updates.alertAckAt = null

  await db.update(schema.listingStatus).set(updates).where(eq(schema.listingStatus.propertyId, propertyId))
  if (observations.length > 0) await db.insert(schema.priceObservations).values(observations)

  return { propertyId, state, price: reading.price, priceChanged, message: reading.reason }
}

async function ensureStatusRow(propertyId: string, portal: Portal) {
  const db = getDatabase()
  const existing = await db.query.listingStatus.findFirst({
    where: eq(schema.listingStatus.propertyId, propertyId)
  })
  if (existing) {
    if (existing.portal !== portal) {
      await db.update(schema.listingStatus).set({ portal }).where(eq(schema.listingStatus.propertyId, propertyId))
    }
    return
  }
  await db.insert(schema.listingStatus).values({ propertyId, portal, state: 'unknown', consecutiveFailures: 0 })
}

function perSqm(price: number | null, areaSqm: number | null | undefined): number | null {
  if (!price || !areaSqm) return null
  return Math.round((price / areaSqm) * 100) / 100
}
