import { fetchFromGeobasis } from '../../../utils/geobasis'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Flurstückskennzeichen/ID ist erforderlich'
    })
  }

  try {
    return await fetchFromGeobasis(`/api/flurstueck/${encodeURIComponent(id)}`)
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: err.message
    })
  }
})
