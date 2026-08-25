import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { CURRENT_VERSION, RELEASE_NOTES } from '../../lib/releaseNotes'

/**
 * Which version is running, and what each one brought.
 *
 * The running version is read from the build (package.json via Vite's define),
 * not written out by hand — so it can't claim to be a version it isn't, which
 * is the one thing a screen like this must never do.
 */
export function AboutSettingsPage() {
  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Version & Neues" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-soft">Installierte Version</span>
          <span className="text-lg font-bold text-ink">{CURRENT_VERSION}</span>
        </div>
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
