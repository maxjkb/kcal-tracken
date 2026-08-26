import { useNavigate } from 'react-router-dom'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { CURRENT_VERSION, RELEASE_NOTES } from '../../lib/releaseNotes'
import { resetDayShapeIntro } from '../../lib/dayShapeIntro'

/**
 * Which version is running, and what each one brought.
 *
 * The running version is read from the build (package.json via Vite's define),
 * not written out by hand — so it can't claim to be a version it isn't, which
 * is the one thing a screen like this must never do.
 */
export function AboutSettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Version & Neues" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-soft">Installierte Version</span>
          <span className="type-figure text-lg text-ink">{CURRENT_VERSION}</span>
        </div>
      </section>

      {/* A one-time explanation you dismissed by accident, or that ran before
          you were paying attention, is worse than none — so the day shape's
          introduction stays reachable rather than being genuinely one-shot. */}
      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Tagesform</h2>
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">
          Die Übersicht im Feed zeigt deinen Tag als eine Form aus vier Bögen. Die kurze Erklärung dazu kannst du
          dir noch einmal ansehen.
        </p>
        <button
          type="button"
          onClick={() => {
            resetDayShapeIntro()
            navigate('/')
          }}
          className="w-full rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-ink transition hover:bg-line"
        >
          Erklärung noch einmal ansehen
        </button>
      </section>

      <div className="flex flex-col gap-4">
        {RELEASE_NOTES.map((note, i) => (
          <section key={note.version} className="rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">
                Version {note.version}
                {note.version === CURRENT_VERSION && (
                  <span className="ml-2 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    aktuell
                  </span>
                )}
              </h2>
              <span className="shrink-0 text-xs text-ink-soft">
                {new Date(note.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {note.highlights.map((line) => (
                <li key={line} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {i === 0 && RELEASE_NOTES.length > 1 && (
              <p className="mt-3 text-[11px] text-ink-faint">Ältere Versionen darunter.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
