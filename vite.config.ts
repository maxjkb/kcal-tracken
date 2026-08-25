import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/kcal-tracken/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'Tracke',
        short_name: 'Tracke',
        description: 'Ernährungstracker mit KI-Nährwertschätzung',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        start_url: '/kcal-tracken/',
        scope: '/kcal-tracken/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Never cache Gemini API calls
        navigateFallbackDenylist: [/^\/api\//],
        // Purge stale precache entries from older deploys as soon as a new
        // service worker activates, so an old tab can't keep serving a mix
        // of new index.html + orphaned old chunk files (which 404 once a
        // fresh GitHub Pages deploy has overwritten them).
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
