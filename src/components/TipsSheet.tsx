import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MEAL_TYPE_LABELS, type TipSuggestion } from '../lib/db'
import { GeminiError } from '../lib/gemini'
import { generateTipsRun, isTipsRunStale } from '../lib/tips'
import { guessMealType } from '../lib/mealTypeGuess'
import { getApiKey } from '../lib/settings'
import { useLatestTipsRun } from '../hooks/useTips'
import { HeaderButton } from './PageHeader'
import { Sheet } from './Sheet'
import { BouncingDots } from './BouncingDots'
import { MacroIcon, type MacroType } from './MacroIcon'
import { StaggeredList } from './StaggeredList'

const FOCUS_BG: Record<TipSuggestion['focus'], string> = {
  kcal: 'bg-kcal text-white',
  protein: 'bg-protein text-white',
  carbs: 'bg-carbs text-white',
  fat: 'bg-fat text-ink',
  general: 'bg-accent/15 text-accent',
}

/**
 * Lightbulb entry point for "was jetzt essen"-tips, sat in the Feed header
 * next to Einstellungen/+. Only rendered by FeedPage for today — a past day
 * has no remaining gap left to close.
 *
 * The underlying run is normally already sitting in IndexedDB by the time
 * this opens (see lib/tips.ts's refreshTipsIfStale, called once at app
 * start), so opening the sheet is usually just reading what's there. It
 * still re-checks staleness itself: a session left open across a slot
 * boundary (say, 10:50 to 11:10) would otherwise keep showing breakfast
 * tips at lunchtime until the next full app launch.
 */
export function TipsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <HeaderButton onClick={() => setOpen(true)} label="Tipps für jetzt">
        <BulbIcon />
      </HeaderButton>
      {open && <TipsSheetContent onClose={() => setOpen(false)} />}
    </>
  )
}

function TipsSheetContent({ onClose }: { onClose: () => void }) {
  const run = useLatestTipsRun()
  const hasApiKey = Boolean(getApiKey())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guards the mount-only auto-refresh below against StrictMode's double
  // invoke and against re-firing every time useLatestTipsRun's live query
  // ticks (e.g. right after that very refresh writes its result).
  const attempted = useRef(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      await generateTipsRun()
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei den Tipps.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (attempted.current || run === undefined || !hasApiKey) return
    attempted.current = true
    if (isTipsRunStale(run ?? undefined)) void refresh()
    // Mount-only: the "Neu vorschlagen" button below covers a deliberate
    // re-roll or a retry after this attempt failed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, hasApiKey])

  const tips = run?.tips ?? []

  return (
    <Sheet
      onClose={onClose}
      sheetClassName="glass flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
    >
      <div className="flex min-h-0 flex-col overflow-y-auto p-5 pt-7">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <BulbIcon />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">Tipps für {MEAL_TYPE_LABELS[guessMealType()]}</h2>
              <p className="text-xs text-ink-soft">Basierend auf dem, was heute schon gegessen wurde.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading || !hasApiKey}
            className="shrink-0 py-1.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <BouncingDots /> : 'Neu vorschlagen'}
          </button>
        </div>

        {!hasApiKey && (
          <p className="rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
            Kein API-Key hinterlegt.{' '}
            <Link to="/settings" onClick={onClose} className="font-semibold underline">
              Jetzt in den Einstellungen eintragen
            </Link>
            , um Tipps zu erhalten.
          </p>
        )}

        {error && <p className="text-sm font-medium text-danger">{error}</p>}

        {run === undefined && !error && <p className="py-8 text-center text-sm text-ink-soft">Lädt…</p>}

        {run === null && loading && <p className="py-8 text-center text-sm text-ink-soft">Lädt…</p>}

        {run && tips.length === 0 && !loading && (
          <p className="py-8 text-center text-xs text-ink-soft">
            Aktuell keine Tipps — die Ernährung heute sieht schon ausgewogen aus.
          </p>
        )}

        {tips.length > 0 && (
          <StaggeredList className="flex flex-col gap-2.5">
            {tips.map((tip, i) => (
              <div key={i} className="glass-subtle flex items-start gap-3 rounded-2xl p-3.5">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${FOCUS_BG[tip.focus]}`}>
                  {tip.focus === 'general' ? (
                    <BulbIcon className="h-3.5 w-3.5" />
                  ) : (
                    <MacroIcon type={tip.focus as MacroType} className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{tip.suggestion}</p>
                  <p className="text-xs text-ink-soft">{tip.reason}</p>
                </div>
              </div>
            ))}
          </StaggeredList>
        )}
      </div>
    </Sheet>
  )
}

function BulbIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.45.95 1.16.95 1.9V16h5.1v-.2c0-.74.35-1.45.95-1.9A6 6 0 0 0 12 3Z" />
    </svg>
  )
}
