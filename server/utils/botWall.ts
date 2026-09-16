// Erkennung von Bot-Schutzseiten der Immobilienportale.
//
// Hintergrund: Nicht jedes Portal benutzt Cloudflare. ImmobilienScout24 liefert eine
// eigene Wall mit HTTP 401 ("Ich bin kein Roboter"), immowelt setzt DataDome ein,
// andere Incapsula oder PerimeterX. Wer nur auf Cloudflare-Marker und 403/503 prüft,
// hält diese Seiten für ein gültiges Inserat und importiert die Fehlerseite.

export interface BlockDetection {
  blocked: boolean
  vendor?: string
  reason?: string
}

interface Signature {
  vendor: string
  /** Kleingeschriebene Textbausteine; einer reicht für einen Treffer. */
  markers: string[]
}

const SIGNATURES: Signature[] = [
  {
    vendor: 'ImmobilienScout24 Bot-Schutz',
    markers: ['ich bin kein roboter', 'zugriffsschutz - immobilienscout24', 'sicherheitsabfrage']
  },
  {
    vendor: 'Cloudflare',
    markers: [
      'just a moment...',
      'cf-browser-verification',
      'cloudflare ray id',
      'attention required! | cloudflare',
      'cf_chl_opt',
      '/cdn-cgi/challenge-platform'
    ]
  },
  {
    vendor: 'DataDome',
    markers: ['captcha-delivery.com', 'datadome', 'please enable js and disable any ad blocker']
  },
  {
    vendor: 'Imperva/Incapsula',
    markers: ['_incapsula_', 'incapsula incident id', 'incap_ses']
  },
  {
    vendor: 'PerimeterX',
    markers: ['px-captcha', 'perimeterx', '_pxhd']
  },
  {
    vendor: 'Akamai',
    markers: ['akamai reference', 'errors.edgesuite.net']
  },
  {
    vendor: 'Captcha',
    markers: ['g-recaptcha', 'recaptcha/api.js', 'hcaptcha.com/captcha', 'data-sitekey']
  }
]

/** Statuscodes, die typischerweise für eine Bot-Abwehr stehen. */
const BLOCKING_STATUS: Record<number, string> = {
  401: 'Zugriff verweigert (HTTP 401)',
  403: 'Zugriff verweigert (HTTP 403)',
  429: 'Zu viele Anfragen (HTTP 429)',
  503: 'Dienst nicht verfügbar (HTTP 503)'
}

/**
 * Prüft, ob die Antwort eine Bot-Schutzseite statt des Inserats ist.
 * `status` ist optional, weil FlareSolverr den Statuscode nicht immer durchreicht.
 */
export function detectBlockPage(html: string, status?: number, url?: string): BlockDetection {
  const host = url ? safeHost(url) : 'die Seite'
  const haystack = (html || '').slice(0, 200_000).toLowerCase()

  for (const signature of SIGNATURES) {
    const hit = signature.markers.find(marker => haystack.includes(marker))
    if (hit) {
      return {
        blocked: true,
        vendor: signature.vendor,
        reason: `${host} hat eine Bot-Schutzseite ausgeliefert (${signature.vendor})`
      }
    }
  }

  if (typeof status === 'number') {
    if (BLOCKING_STATUS[status]) {
      return {
        blocked: true,
        vendor: 'HTTP-Status',
        reason: `${host} hat den Abruf abgewiesen: ${BLOCKING_STATUS[status]}`
      }
    }
    if (status < 200 || status >= 300) {
      return {
        blocked: true,
        vendor: 'HTTP-Status',
        reason: `${host} antwortete mit HTTP ${status}`
      }
    }
  }

  // Ein echtes Exposé ist immer mehrere zehn Kilobyte groß. Eine Handvoll Bytes
  // ohne jede Inseratsstruktur ist eine Fehler- oder Weiterleitungsseite.
  if (haystack.length < 4000 && !haystack.includes('og:title') && !haystack.includes('application/ld+json')) {
    return {
      blocked: true,
      vendor: 'Leere Antwort',
      reason: `${host} lieferte nur eine ${Math.round(haystack.length / 1024 * 10) / 10} KB große Seite ohne Inseratsdaten`
    }
  }

  return { blocked: false }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'die Seite'
  }
}

/**
 * Entfernt Tracking-Parameter und Fragmente aus einer Inserat-URL.
 * Die geteilten Links der Portale hängen utm_*-Parameter und "#/" an, die den
 * Abruf unnötig aufblähen und Vergleiche zwischen zwei Links derselben Anzeige verhindern.
 */
export function normalizeListingUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|referrer$|m$|serp_view$)/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    return url.toString().replace(/\?$/, '')
  } catch {
    return rawUrl
  }
}

/**
 * Hosts, bei denen FlareSolverr nachweislich nicht hilft.
 *
 * Gemessen am 15.09.2026 gegen FlareSolverr 3.5.0: ImmobilienScout24 liefert eine
 * eigene Wall mit HTTP 401 statt einer Cloudflare-JS-Challenge. FlareSolverr
 * protokolliert "Challenge not detected!" und reicht die Schutzseite unverändert
 * durch - einmal nach 1 s, einmal nach 600 s. Den Nutzer hier auf FlareSolverr zu
 * verweisen, wäre eine falsche Fährte.
 */
const FLARESOLVERR_WONT_HELP = ['immobilienscout24.de']

export function flareSolverrCanHelp(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase()
    return !FLARESOLVERR_WONT_HELP.some(blocked => host === blocked || host.endsWith('.' + blocked))
  } catch {
    return true
  }
}
