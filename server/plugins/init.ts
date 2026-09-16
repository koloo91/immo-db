import { seedDatabase } from '../database/seed'

export default defineNitroPlugin(async () => {
  try {
    await seedDatabase()
  } catch (err) {
    console.error('Error during database initialization/seeding:', err)
  }
})
