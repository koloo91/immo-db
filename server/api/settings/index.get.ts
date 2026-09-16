import { fetchFromGeobasis, getGeobasisUrl } from '../../utils/geobasis'
import { getGeminiClient, getGeminiModel } from '../../utils/gemini'
import { checkFlareSolverrHealth } from '../../utils/flaresolverr'
import { isSearchAvailable } from '../../utils/search'
import { getQueueStatus } from '../../utils/queue'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  // 1. Geobasis
  const geobasisUrl = getGeobasisUrl()
  let geobasisOnline = false
  let geobasisMessage = ''

  try {
    const health = await fetchFromGeobasis('/health')
    geobasisOnline = true
    geobasisMessage = `Online (Status: ${health.status || 'OK'})`
  } catch (e: any) {
    geobasisOnline = false
    geobasisMessage = e.message
  }

  // 2. FlareSolverr
  const flareSolverrStatus = await checkFlareSolverrHealth()

  // 3. Suche & Queue
  const [search, queue] = await Promise.all([isSearchAvailable(), getQueueStatus()])

  // 4. Gemini
  const hasGeminiKey = !!process.env.GEMINI_API_KEY
  const geminiModel = getGeminiModel()

  return {
    geobasis: {
      url: geobasisUrl,
      online: geobasisOnline,
      message: geobasisMessage
    },
    flaresolverr: flareSolverrStatus,
    meilisearch: { url: config.meilisearchUrl, ...search },
    redis: { url: config.redisUrl, ...queue },
    gemini: {
      hasKey: hasGeminiKey,
      model: geminiModel,
      keyMasked: hasGeminiKey ? `${process.env.GEMINI_API_KEY?.slice(0, 6)}...${process.env.GEMINI_API_KEY?.slice(-4)}` : null
    }
  }
})
