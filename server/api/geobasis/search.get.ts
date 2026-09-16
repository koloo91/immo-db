import { fetchFromGeobasis } from '../../utils/geobasis'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (!query.query) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Suchbegriff (query) ist erforderlich'
    })
  }

  try {
    return await fetchFromGeobasis('/api/search', {
      query: query.query,
      limit: query.limit || 10,
      category: query.category || 'kataster'
    })
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: err.message
    })
  }
})
