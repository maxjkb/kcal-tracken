import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

/**
 * Writes dist/version.json — a tiny, deliberately un-cached marker of
 * whatever version is ACTUALLY sitting on the server right now, fetched
 * fresh (see UpdateSettingsPage.tsx) to answer "is the version I'm running
 * really the newest one", as distinct from __APP_VERSION__ below, which is
 * baked into the JS bundle at build time and only ever describes whatever
 * build happens to be currently loaded/running — exactly the number that's
 * in question, so it can't also serve as the source of truth to check it
 * against. Written via `writeBundle`, which — regardless of plugin array
 * order — always fires before vite-plugin-pwa's own `closeBundle` (where it
 * scans dist/ to build the Workbox precache manifest), so version.json
 * already exists by the time that scan happens and can be explicitly
 * excluded from precaching below (globIgnores) — it must only ever come
 * from the network, never from a cached response.
 */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    writeBundle() {
      writeFileSync(resolve('dist/version.json'), JSON.stringify({ version: pkg.version }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/kcal-tracken/',
  // The app shows its own version under Einstellungen, and package.json is the
  // one place that number is maintained — reading it here keeps the two from
  // drifting, which a hand-copied constant reliably does.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
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
        // version.json exists specifically to answer "what's actually on
        // the server", so it must never itself come from a cache — excluded
        // from the precache manifest, and explicitly routed NetworkOnly so
        // no other runtime-caching rule can pick it up either.
        globIgnores: ['version.json'],
        runtimeCaching: [
          {
            urlPattern: /\/version\.json$/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
