import { checkFlareSolverrHealth } from '../../utils/flaresolverr'

export default defineEventHandler(async () => {
  return await checkFlareSolverrHealth()
})
