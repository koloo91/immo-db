import { reindexAll } from '../../utils/search'

/** Baut den Suchindex vollständig neu auf - für den Zweifelsfall. */
export default defineEventHandler(async () => {
  try {
    const result = await reindexAll()
    return { success: true, ...result }
  } catch (err: any) {
    const config = useRuntimeConfig()
    throw createError({
      statusCode: 503,
      statusMessage: 'Index konnte nicht aufgebaut werden',
      message: `Meilisearch unter ${config.meilisearchUrl} antwortet nicht (${err.message}). Läuft "docker compose up -d"?`
    })
  }
})
