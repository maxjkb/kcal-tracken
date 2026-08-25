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
 * instead: it asks it to re-check the server for a newer build, and if one is
 * waiting, activating it and reloading is a single button.
 *
 * The check is real. `update()` refetches the service worker script, so
 * "Aktuell" here means the server was asked just now — not that nothing has
 * been noticed passively.
 */
export function UpdateSettingsPage() {
  const [state, setState] = useState<CheckState>('idle')
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      setRegistration(r ?? null)
      if (!r) setState('unsupported')
    },
    onRegisterError() {
      setState('unsupported')
    },
  })

  // Derived, not synced through an effect: a waiting worker is the answer
  // regardless of what the button last said, and expressing that as a plain
  // expression avoids a second render just to correct the first.
  const effective: CheckState = needRefresh ? 'available' : state

  async function handleCheck() {
    if (!registration) {
      setState('unsupported')
      return
    }
    setState('checking')
    try {
      await registration.update()
      // update() resolves once the server has been asked. A worker that was
      // found flips needRefresh, which `effective` above picks up; otherwise
      // this really is the newest build.
      setState('uptodate')
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

        {effective === 'available' ? (
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="glass-accent w-full rounded-2xl px-4 py-3 text-sm font-semibold transition"
          >
            Neue Version installieren und neu laden
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheck}
            disabled={effective === 'checking'}
            className="w-full rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-ink transition hover:bg-line disabled:opacity-50"
          >
            {effective === 'checking' ? 'Wird geprüft…' : 'Auf Updates prüfen'}
          </button>
        )}

        {effective === 'uptodate' && (
          <p className="mt-3 text-xs font-medium text-ink-soft">Du hast bereits die neueste Version.</p>
        )}
        {effective === 'available' && (
          <p className="mt-3 text-xs font-medium text-accent">Eine neuere Version steht bereit.</p>
        )}
        {effective === 'unsupported' && (
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
