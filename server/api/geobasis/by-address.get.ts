import { fetchFromGeobasis } from '../../utils/geobasis'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (!query.address) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Adresse (address) ist erforderlich'
    })
  }

  try {
    return await fetchFromGeobasis('/api/flurstueck/by-address', {
      address: query.address
    })
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: err.message
    })
  }
})
