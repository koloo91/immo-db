import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  css: ['~/assets/css/main.css', 'leaflet/dist/leaflet.css'],

  vite: {
    plugins: [
      tailwindcss()
    ]
  },

  modules: [
    '@nuxt/icon'
  ],

  runtimeConfig: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    geobasisUrl: process.env.GEOBASIS_URL || 'http://127.0.0.1:8080',
    flaresolverrUrl: process.env.FLARESOLVERR_URL || 'http://127.0.0.1:8191/v1',
    ownEmail: process.env.OWN_EMAIL || '',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6380',
    meilisearchUrl: process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700',
    meilisearchKey: process.env.MEILISEARCH_KEY || 'immo-db-ai-local-dev-key',
    public: {
      ownEmail: process.env.OWN_EMAIL || '',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6380',
    meilisearchUrl: process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700',
    meilisearchKey: process.env.MEILISEARCH_KEY || 'immo-db-ai-local-dev-key',
      geobasisUrl: process.env.GEOBASIS_URL || 'http://127.0.0.1:8080',
      flaresolverrUrl: process.env.FLARESOLVERR_URL || 'http://127.0.0.1:8191/v1'
    }
  },

  nitro: {
    experimental: {
      openAPI: true
    }
  }
})
