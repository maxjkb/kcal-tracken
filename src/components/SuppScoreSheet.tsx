import { useState } from 'react'
import { toLocalDateKey } from '../lib/db'
import { FULL_MONTH_LABELS, startOfWeek } from '../lib/stats'
import { useSupplementLogInRange, useSupplementScore } from '../hooks/useSupplements'
import { ChevronIcon } from './ChevronIcon'
import { Sheet } from './Sheet'
import { GlassSurface } from '../glass/GlassSurface'

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function buildCalendarGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const start = startOfWeek(firstOfMonth)
  const days: Date[] = []
  const cur = new Date(start)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/**
 * The Supplementscore's own destination — a Sheet now, not a routed page
 * (`/supplements/score` used to exist; both entry points below open this
 * same component instead). Two things the "Heute" tab never showed: the
 * score broken down per supplement side by side (that lived squeezed into
 * SupplementScoreCard already, but with no room to breathe), and a calendar
 * of which days actually had at least one supplement taken at all, across
 * the whole routine — the shape of a habit over a month, which a single
 * running number can't show on its own.
 *
 * Reached from two places, both rendering this same sheet locally: the
 * Statistik card (SupplementScoreCard) and a dedicated trophy button in the
 * Supplements page header, next to the Katalog button.
 */
export function SuppScoreSheet({ onClose }: { onClose: () => void }) {
  const score = useSupplementScore()

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1-12

  const monthStartKey = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`
  const monthEndKey = toLocalDateKey(new Date(viewYear, viewMonth, 0))
  // Any supplement, not one in particular — one dot per day answers "did I
  // take something that day at all", the habit-level question a calendar is
  // actually good at. The per-supplement breakdown above already answers
  // "which one", so the two views aren't duplicating the same information.
  const monthLog = useSupplementLogInRange(monthStartKey, monthEndKey)
  const daysWithIntake = new Set((monthLog ?? []).map((e) => e.date))

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth() + 1)
  }

  const grid = buildCalendarGrid(viewYear, viewMonth)
  const todayKey = toLocalDateKey(today)

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-5 py-4">
        <h2 className="font-display text-lg font-semibold text-ink">Supp-Score</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-bg"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 text-center shadow-sm shadow-black/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Gesamt, seit Beginn</p>
          {score?.overallScore != null ? (
            <p className="mt-1 flex items-baseline justify-center gap-1.5">
              <span className="hero-num text-4xl text-accent">{score.overallScore}</span>
              <span className="text-sm font-medium text-ink-soft">/ 100</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">–</p>
          )}
        </GlassSurface>

        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Pro Supp</h3>
          {score === undefined ? (
            <p className="py-4 text-center text-sm text-ink-soft">Lädt…</p>
          ) : score.rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-soft">Noch keine Supps auf der Liste.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {score.rows.map((r) => {
                const rowScore = r.totalSlots > 0 ? Math.round((r.checkedSlots / r.totalSlots) * 100) : null
                const pct = r.totalSlots > 0 ? Math.min(100, (r.checkedSlots / r.totalSlots) * 100) : 0
                return (
                  <div key={r.id}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink">{r.name}</span>
                      <span className="shrink-0 text-xs text-ink-soft">
                        {rowScore === null ? '–' : `${r.checkedSlots}/${r.totalSlots} · ${rowScore} Pkt.`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/60">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </GlassSurface>

        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Vorheriger Monat"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-ink-soft hover:bg-line"
            >
              <ChevronIcon direction="left" className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-medium text-ink">
              {FULL_MONTH_LABELS[viewMonth - 1]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Nächster Monat"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-ink-soft hover:bg-line"
            >
              <ChevronIcon direction="right" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-faint">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((date) => {
              const key = toLocalDateKey(date)
              const inMonth = date.getMonth() + 1 === viewMonth
              const isToday = key === todayKey
              const hasIntake = daysWithIntake.has(key)
              return (
                <div
                  key={key}
                  className={`relative flex h-9 flex-col items-center justify-center rounded-full text-sm ${
                    inMonth ? 'text-ink' : 'text-ink-faint'
                  } ${isToday ? 'ring-1 ring-inset ring-accent' : ''}`}
                >
                  {date.getDate()}
                  {hasIntake && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
                </div>
              )
            })}
          </div>
        </GlassSurface>
      </div>
    </Sheet>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
