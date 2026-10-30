//@ts-nocheck

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  modules: ['@nuxt/ui', 'motion-v/nuxt'],
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', sizes: 'any', href: '/favicon.ico?v=2' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png?v=2' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=2' }
      ]
    },
    pageTransition: { name: 'app-page', mode: 'default' }
  },
  icon: {
    serverBundle: 'local',
    clientBundle: {
      scan: true,
      collections: ['lucide']
    }
  },
  css: ['~/assets/css/main.css'],
  vite: {
    optimizeDeps: {
      include: ['tesseract.js']
    }
  },
  runtimeConfig: {
    sessionPassword: '',
    gatewaySecret: '',
    strapiInternalUrl: process.env.NUXT_STRAPI_INTERNAL_URL || 'http://localhost:1337',
    trustedProxies: '',
    appOrigin: process.env.NUXT_APP_ORIGIN || 'http://localhost:3000',
    public: {
      strapiUrl: ''
    }
  }
})
