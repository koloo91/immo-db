import { getSearchClient, SEARCH_INDEX, type SearchDoc } from '../utils/search'

const TYPE_LABELS: Record<string, string> = {
  property: 'Grundstücke',
  document_page: 'Dokumente',
  email: 'E-Mails',
  analysis: 'KI-Analysen'
}

/**
 * Globale Suche über Grundstücke, Dokumentseiten, Mails und Analysen.
 *
 * Wichtig: Ist Meilisearch nicht erreichbar, gibt es einen 503 mit klarer Meldung -
 * niemals eine leere Trefferliste. Ein leeres Ergebnis darf nicht wie "nichts gefunden"
 * aussehen, wenn in Wahrheit der Dienst fehlt.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q || '').toString().trim()

  if (!q) {
    return { query: '', total: 0, groups: [] }
  }

  const filters: string[] = []
  if (query.type) filters.push(`type = "${String(query.type).replace(/"/g, '')}"`)
  if (query.propertyId) filters.push(`propertyId = "${String(query.propertyId).replace(/"/g, '')}"`)

  try {
    const index = getSearchClient().index<SearchDoc>(SEARCH_INDEX)
    const result = await index.search(q, {
      limit: Number(query.limit) || 40,
      filter: filters.length ? filters.join(' AND ') : undefined,
      attributesToHighlight: ['title', 'text'],
      attributesToCrop: ['text'],
      cropLength: 30,
      highlightPreTag: '«',
      highlightPostTag: '»'
    })

    // Nach Typ gruppieren, Reihenfolge wie in TYPE_LABELS
    const buckets = new Map<string, any[]>()
    for (const hit of result.hits as any[]) {
      const list = buckets.get(hit.type) || []
      list.push({
        id: hit.id,
        type: hit.type,
        propertyId: hit.propertyId,
        propertyTitle: hit.propertyTitle,
        title: hit._formatted?.title || hit.title,
        snippet: hit._formatted?.text || '',
        pageNumber: hit.pageNumber ?? null,
        docId: hit.docId ?? null,
        threadId: hit.threadId ?? null,
        occurredAt: hit.occurredAt
      })
      buckets.set(hit.type, list)
    }

    const groups = Object.keys(TYPE_LABELS)
      .filter(type => buckets.has(type))
      .map(type => ({ type, label: TYPE_LABELS[type], hits: buckets.get(type)! }))

    return {
      query: q,
      total: result.estimatedTotalHits ?? result.hits.length,
      took: result.processingTimeMs,
      groups
    }
  } catch (err: any) {
    const config = useRuntimeConfig()
    throw createError({
      statusCode: 503,
      statusMessage: 'Suchdienst nicht erreichbar',
      message: `Meilisearch ist unter ${config.meilisearchUrl} nicht erreichbar (${err.message}). Starte die Dienste mit: docker compose up -d`
    })
  }
})
