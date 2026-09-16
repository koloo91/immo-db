import { fetchFromGeobasis, getGeobasisUrl } from '../../utils/geobasis'

export default defineEventHandler(async () => {
  const url = getGeobasisUrl()
  try {
    const health = await fetchFromGeobasis('/health')
    return {
      online: true,
      url,
      data: health
    }
  } catch (err: any) {
    return {
      online: false,
      url,
      message: err.message || 'Geobasis Daemon nicht erreichbar'
    }
  }
})
