import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { CURRENT_VERSION } from '../../lib/releaseNotes'

type CheckState = 'idle' | 'checking' | 'uptodate' | 'stale' | 'unsupported'

const STORAGE_KEY = 'kcal-tracker:update-check-step'
/** Reload cycle length: 3 actual page reloads (steps 1-3), then the 4th step verifies without reloading again. */
const RELOAD_STEPS = 3
/** Gives a just-activated service worker a moment to actually take control before the next step asks it anything — reloading immediately after update() resolves can otherwise still hit the outgoing worker. */
const STEP_DELAY_MS = 700

function readStep(): number {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function writeStep(step: number): void {
  try {
    if (step <= 0) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, String(step))
  } catch {
    // Private mode / storage blocked — worst case the cycle can't resume
    // across the reload and just stops, same as any other storage failure
    // elsewhere in the app.
  }
}

/**
 * Getting a new version onto the device, without guessing at how — and,
 * per explicit request, actually PROVING it worked rather than reporting
 * "up to date" from a single same-tick check that can't yet see whatever a
 * freshly found update is still in the middle of installing.
 *
 * The flow: search → reload a few times → a verdict grounded in something
 * outside the currently-running bundle. `registration.update()` alone
 * used to be the whole check, but it only asks "is there a byte-different
 * service-worker script on the server" — true immediately, before the new
 * worker has actually activated and taken control of this page. Comparing
 * __APP_VERSION__ (baked into the JS that's running right now) against
 * itself can never prove anything either. So each step here re-triggers
 * update(), gives the result a moment to settle, and reloads — carrying a
 * step counter across the reload via sessionStorage, since a full
 * navigation always restarts this component from scratch. After a few
 * reloads worth of chances to actually activate, the last step fetches
 * version.json — a small file written fresh at every deploy (see
 * vite.config.ts) and explicitly excluded from the service worker's own
 * cache, so it always reflects what's really on the server right now — and
 * compares it to whatever version the page ended up on. That comparison,
 * not a same-tick "no update event fired", is the actual verdict.
 */
export function UpdateSettingsPage() {
  // Initialized from sessionStorage, not a fixed 'idle'/0: a reload mid-cycle
  // re-mounts this component from scratch, and starting it on 'idle' for the
  // one tick before the resume effect runs would flash the button back to
  // "Auf Updates prüfen" between reloads.
  const [state, setState] = useState<CheckState>(() => (readStep() > 0 ? 'checking' : 'idle'))
  const [step, setStep] = useState(() => readStep())
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [registrationReady, setRegistrationReady] = useState(false)
  const resumed = useRef(false)

  useRegisterSW({
    onRegisteredSW(_url, r) {
      setRegistration(r ?? null)
      setRegistrationReady(true)
      if (!r) setState('unsupported')
    },
    onRegisterError() {
      setRegistrationReady(true)
      setState('unsupported')
    },
  })

  async function verifyAgainstServer() {
    try {
      // A unique query string, not just `cache: 'no-store'`: that stops
      // this browser's own HTTP cache from answering, but not necessarily
      // an edge/CDN cache in front of the static host keyed on the exact
      // URL — a value it's never seen forces a real fetch through.
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`version.json: HTTP ${res.status}`)
      const data = (await res.json()) as { version?: unknown }
      const latest = typeof data.version === 'string' ? data.version : null
      if (latest && latest !== CURRENT_VERSION) {
        setServerVersion(latest)
        setState('stale')
      } else {
        setState('uptodate')
      }
    } catch {
      setState('unsupported')
    } finally {
      writeStep(0)
      setStep(0)
    }
  }

  async function runStep(n: number, reg: ServiceWorkerRegistration | null) {
    setStep(n)
    setState('checking')
    if (reg) {
      try {
        await reg.update()
      } catch {
        // Best effort — still worth completing the reload cycle even if
        // this one check request failed (e.g. a flaky connection).
      }
    }
    await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS))
    if (n >= RELOAD_STEPS) {
      await verifyAgainstServer()
    } else {
      writeStep(n + 1)
      window.location.reload()
    }
  }

  // Resumes a cycle already in progress from before this exact reload —
  // this page load IS one of the reload cycle's own reloads, not a fresh
  // visit, whenever the counter says so.
  useEffect(() => {
    if (resumed.current || !registrationReady) return
    resumed.current = true
    const pending = readStep()
    if (pending <= 0) return
    if (!registration) {
      // onRegisteredSW/onRegisterError already set state to 'unsupported'
      // above — nothing left to resume into.
      writeStep(0)
      return
    }
    void runStep(pending, registration)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationReady])

  function handleCheck() {
    if (!registration) {
      setState('unsupported')
      return
    }
    setServerVersion(null)
    writeStep(1)
    void runStep(1, registration)
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
          nachsehen, ob eine neuere Version bereitsteht — die Seite lädt dabei ein paar Mal neu, damit eine
          gefundene Aktualisierung auch wirklich übernommen ist, bevor das Ergebnis angezeigt wird.
        </p>

        <button
          type="button"
          onClick={handleCheck}
          disabled={state === 'checking'}
          className="w-full rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-ink transition hover:bg-line disabled:opacity-50"
        >
          {state === 'checking' ? `Suche nach Updates… (${step}/${RELOAD_STEPS})` : 'Auf Updates prüfen'}
        </button>

        {state === 'uptodate' && (
          <p className="mt-3 text-xs font-medium text-ink-soft">
            Geprüft — du bist auf der neuesten Version ({CURRENT_VERSION}).
          </p>
        )}
        {state === 'stale' && (
          <p className="mt-3 text-xs font-medium text-accent">
            Es gibt weiterhin eine neuere Version{serverVersion ? ` (${serverVersion})` : ''} — deine App zeigt noch{' '}
            {CURRENT_VERSION}. Bitte die App einmal komplett schließen und neu öffnen (siehe unten).
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
