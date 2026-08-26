import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { CURRENT_VERSION } from '../../lib/releaseNotes'

type CheckState = 'idle' | 'checking' | 'uptodate' | 'available' | 'unsupported'

/**
 * Getting a new version onto the device, without guessing at how.
 *
 * A plain "press Cmd+R" note would be advice, not a feature — and on an
 * installed PWA there is no Cmd+R at all. This talks to the service worker
 * instead: it asks it to re-check the server for a newer build right now,
 * rather than waiting on the browser's own update schedule.
 *
 * vite.config.ts registers with `registerType: 'autoUpdate'`, which matters
 * for what this page can and can't show: a found update installs and
 * reloads the page BY ITSELF (via vite-plugin-pwa's own "activated" →
 * `window.location.reload()` — see registerSW in
 * node_modules/vite-plugin-pwa/dist/client/build/register.js) — there is no
 * separate "install now" step for a person to trigger, unlike
 * `registerType: 'prompt'`. Concretely: the hook's `needRefresh` flag is
 * *only* ever set in `'prompt'` mode; under `'autoUpdate'` it never becomes
 * true, so a button gated on it can never render. This page used to have
 * exactly that button — dead code that could never appear — and has been
 * cut. What's left instead: a real, working "Auf Updates prüfen" button
 * (`registration.update()` is a genuine fetch-and-compare against the
 * server) plus a native `updatefound` listener, attached before the call, to
 * tell the difference between "nothing new" and "found one, installing".
 */
export function UpdateSettingsPage() {
  const [state, setState] = useState<CheckState>('idle')
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useRegisterSW({
    onRegisteredSW(_url, r) {
      setRegistration(r ?? null)
      if (!r) setState('unsupported')
    },
    onRegisterError() {
      setState('unsupported')
    },
  })

  async function handleCheck() {
    if (!registration) {
      setState('unsupported')
      return
    }
    setState('checking')
    try {
      // Attached before update() rather than after: `updatefound` can fire
      // as part of update()'s own work, and a listener added afterward could
      // miss it.
      let found = false
      const onUpdateFound = () => {
        found = true
      }
      registration.addEventListener('updatefound', onUpdateFound)
      await registration.update()
      registration.removeEventListener('updatefound', onUpdateFound)
      // A found update is already on its way to installing itself — under
      // autoUpdate there's nothing left here to trigger; see the note above.
      setState(found ? 'available' : 'uptodate')
    } catch {
      setState('unsupported')
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Aktualisierung" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-soft">Installierte Version</span>
          <span className="text-lg font-bold text-ink">{CURRENT_VERSION}</span>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-ink-soft">
          Die App aktualisiert sich normalerweise von selbst, wenn du sie neu startest. Hier kannst du sofort
          nachsehen, ob eine neuere Version bereitsteht.
        </p>

        {/* One button, always — under registerType: 'autoUpdate' there is no
            separate "now install it" step for a person to trigger (see the
            component doc comment above), so there is nothing a second button
            here could ever do. */}
        <button
          type="button"
          onClick={handleCheck}
          disabled={state === 'checking'}
          className="w-full rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-ink transition hover:bg-line disabled:opacity-50"
        >
          {state === 'checking' ? 'Wird geprüft…' : 'Auf Updates prüfen'}
        </button>

        {state === 'uptodate' && (
          <p className="mt-3 text-xs font-medium text-ink-soft">Du hast bereits die neueste Version.</p>
        )}
        {state === 'available' && (
          <p className="mt-3 text-xs font-medium text-accent">
            Neue Version gefunden — sie installiert sich jetzt im Hintergrund und lädt die App in Kürze von selbst
            neu.
          </p>
        )}
        {state === 'unsupported' && (
          <p className="mt-3 text-xs text-ink-soft">
            Automatische Prüfung ist hier nicht verfügbar — im Browser hilft ein Neuladen der Seite
            (auf dem Mac <span className="font-medium text-ink">Cmd + R</span>, unter Windows{' '}
            <span className="font-medium text-ink">Strg + R</span>). Als installierte App: einmal komplett
            schließen und neu öffnen.
          </p>
        )}
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Wenn die neue Version nicht erscheint</h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          Als installierte App auf dem Home-Bildschirm hält iOS die alte Fassung manchmal länger fest. Dann hilft
          es, die App zweimal vollständig zu schließen und wieder zu öffnen. Deine Daten bleiben dabei erhalten.
        </p>
      </section>
    </div>
  )
}
