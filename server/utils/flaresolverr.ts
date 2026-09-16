import { detectBlockPage, flareSolverrCanHelp } from './botWall'

export function getFlareSolverrUrl(): string {
  const config = useRuntimeConfig()
  let url = config.flaresolverrUrl || process.env.FLARESOLVERR_URL || 'http://127.0.0.1:8191/v1'
  if (!url.endsWith('/v1')) {
    url = url.replace(/\/$/, '') + '/v1'
  }
  return url
}

export async function checkFlareSolverrHealth(): Promise<{ online: boolean; url: string; message: string; version?: string }> {
  const endpoint = getFlareSolverrUrl()
  const baseHealthUrl = endpoint.replace(/\/v1$/, '')

  try {
    // FlareSolverr responds on base URL or via sessions.list on /v1
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'sessions.list' }),
      signal: AbortSignal.timeout(4000)
    })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      return {
        online: true,
        url: endpoint,
        version: data.version || 'v3',
        message: 'FlareSolverr Dienst ist online und bereit für Cloudflare-Bypasses.'
      }
    }

    return {
      online: false,
      url: endpoint,
      message: `FlareSolverr antwortete mit HTTP ${res.status}`
    }
  } catch (err: any) {
    return {
      online: false,
      url: endpoint,
      message: `FlareSolverr nicht erreichbar unter ${endpoint}: ${err.message}`
    }
  }
}

export interface FetchOptions {
  /**
   * Nur ein Abrufversuch statt drei. Für den geplanten Tageslauf: dort wartet niemand,
   * ein verpasster Tag kostet nichts, und ein Portal, das ohnehin blockt, soll nicht
   * dreimal täglich angefragt werden. Interaktive Aufrufe behalten die Wiederholungen.
   */
  singleAttempt?: boolean
}

export async function fetchHtmlWithFlareSolverr(
  targetUrl: string,
  options: FetchOptions = {}
): Promise<{ html: string; method: 'flaresolverr' | 'direct' }> {
  const flareUrl = getFlareSolverrUrl()

  // Warum FlareSolverr nicht geholfen hat - fließt in die Fehlermeldung ein,
  // damit man nicht raten muss, ob der Dienst fehlt oder die Wall zu stark war.
  let flareNote = `FlareSolverr (${flareUrl}) wurde nicht verwendet`
  let flareReachable = true

  // 1. Zuerst FlareSolverr versuchen - außer bei Portalen, bei denen es nachweislich
  // nichts ausrichtet. Dort würde der Aufruf nur bis zu 65 s Wartezeit kosten
  // (FlareSolverr hält seinen eigenen maxTimeout nicht ein) und am Ende dieselbe
  // Schutzseite liefern.
  const skipFlare = !flareSolverrCanHelp(targetUrl)
  if (skipFlare) {
    flareNote = ''
  }

  try {
    if (skipFlare) throw new Error('skip')

    const response = await fetch(flareUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cmd: 'request.get',
        url: targetUrl,
        maxTimeout: 60000
      }),
      signal: AbortSignal.timeout(65000)
    })

    if (response.ok) {
      const data = await response.json()
      if (data.status === 'ok' && data.solution?.response) {
        const html = data.solution.response
        // Auch FlareSolverr kann an einer Wall scheitern und die Challenge-Seite zurückgeben.
        const blocked = detectBlockPage(html, data.solution.status, targetUrl)
        if (!blocked.blocked) {
          return { html, method: 'flaresolverr' }
        }
        throw createError({
          statusCode: 502,
          statusMessage: 'Inserat durch Bot-Schutz blockiert',
          message: `${blocked.reason}. FlareSolverr hat die Seite zwar geladen, den Schutz aber nicht umgangen. Lege das Grundstück manuell an oder lade das Exposé-PDF hoch (Tab "Dokumente") - die KI zieht die Daten dann daraus.`
        })
      }

      flareNote = `FlareSolverr meldete: ${data.message || data.status || 'unbekannter Fehler'}`
    } else {
      flareNote = `FlareSolverr antwortete mit HTTP ${response.status}`
    }
  } catch (flareErr: any) {
    // Eine bereits aufbereitete Blockmeldung nicht verschlucken.
    if (flareErr?.statusCode) throw flareErr

    if (!skipFlare) {
      flareNote = `FlareSolverr nicht erreichbar unter ${flareUrl}`
      flareReachable = false
      console.warn(`[FlareSolverr] ${flareErr.message}. Versuche direkten Request...`)
    }
  }

  // 2. Fallback: Direktabruf mit Browser-Headern.
  //
  // Die Portale entscheiden nicht deterministisch: derselbe Link liefert mal das
  // Inserat, mal die Bot-Wall. Deshalb wird ein blockierter Abruf kurz wiederholt,
  // statt sofort aufzugeben - das erklärt den größten Teil der bisherigen Unzuverlässigkeit.
  const RETRY_DELAYS_MS = options.singleAttempt ? [0] : [0, 1500, 4000]
  let lastBlock: { reason?: string } | null = null
  let lastNetworkError: string | null = null

  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))

    let directRes: Response
    try {
      directRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      })
    } catch (directErr: any) {
      lastNetworkError = directErr.message
      continue
    }

    const html = await directRes.text()

    // Entscheidend: NICHT nur auf Cloudflare prüfen. Wird das hier übersehen,
    // landet die Bot-Schutzseite in der KI-Extraktion und es entsteht ein
    // Grundstück namens "Zugriffsschutz - ImmobilienScout24" mit lauter leeren Feldern.
    const blocked = detectBlockPage(html, directRes.status, targetUrl)
    if (!blocked.blocked) {
      return { html, method: 'direct' }
    }

    lastBlock = blocked
    lastNetworkError = null
    console.warn(`[Import] ${blocked.reason} - neuer Versuch...`)
  }

  if (lastNetworkError) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Inserat-URL nicht erreichbar',
      message: `Inserat-URL nicht erreichbar: ${lastNetworkError}.${flareNote ? ' ' + flareNote + '.' : ''}`
    })
  }

  // Den Docker-Hinweis nur geben, wenn FlareSolverr tatsächlich fehlt UND bei diesem
  // Portal überhaupt etwas ausrichten kann. Läuft es bereits, oder ist es dem Portal
  // ohnehin nicht gewachsen, wäre "starte es" eine falsche Fährte.
  const manualHint = 'Das Inserat lässt sich nicht automatisch auslesen - lege das Grundstück manuell an oder lade das Exposé-PDF hoch (Tab "Dokumente"), die KI zieht die Daten dann daraus.'
  const hint = skipFlare
    ? `${new URL(targetUrl).host} setzt keine Cloudflare-Challenge ein, sondern eine eigene Wall - auch FlareSolverr kommt daran nicht vorbei. ${manualHint}`
    : flareReachable
      ? manualHint
      : `Starte FlareSolverr und versuche es erneut: docker run -d --name=flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest`

  // flareNote ist leer, wenn FlareSolverr bewusst übersprungen wurde.
  const noteSegment = flareNote ? `${flareNote}. ` : ''

  throw createError({
    statusCode: 502,
    statusMessage: 'Inserat durch Bot-Schutz blockiert',
    message: `${lastBlock?.reason}${RETRY_DELAYS_MS.length > 1 ? ` - auch nach ${RETRY_DELAYS_MS.length} Versuchen` : ''}. ${noteSegment}${hint}`
  })
}
