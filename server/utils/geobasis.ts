export function getGeobasisUrl(): string {
  try {
    const config = useRuntimeConfig()
    return (config.geobasisUrl || process.env.GEOBASIS_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
  } catch {
    return (process.env.GEOBASIS_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
  }
}

export async function fetchFromGeobasis(path: string, query?: Record<string, any>) {
  const baseUrl = getGeobasisUrl()
  const url = new URL(path, baseUrl)
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, String(val))
      }
    }
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Geobasis API error (${response.status}): ${errorText || response.statusText}`)
    }

    return await response.json()
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      throw new Error(`Geobasis API Timeout: Service bei ${baseUrl} antwortet nicht rechtzeitig.`)
    }
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      throw new Error(`Geobasis Daemon nicht erreichbar unter ${baseUrl}. Bitte starte 'geobasis serve'.`)
    }
    throw err
  }
}
