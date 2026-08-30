import { useMemo } from 'react'
import { toLocalDateKey } from '../lib/db'
import { useMySupplements, useSupplementLogInRange, useAllSupplements } from '../hooks/useSupplements'
import { GlassSurface } from '../glass/GlassSurface'

function daysBetween(startKey: string, endKey: string): string[] {
  const start = new Date(`${startKey}T00:00:00`)
  const end = new Date(`${endKey}T00:00:00`)
  const days: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toLocalDateKey(d))
  }
  return days
}

/** Past this score the card calls out a small "gut dabei" nudge — a cheap, one-line
  * way to make a high score feel like it earned something, without a whole badge system. */
const GOOD_SCORE_THRESHOLD = 80

/**
 * "Supplementscore" for whichever period Statistik currently has selected
 * (Tag/Woche/Monat/Jahr) — how many of the configured daily slots actually
 * got checked off, both overall and per supplement. Only counts days from
 * whichever is later of the period's start or the supplement's own
 * createdAt (a supplement added mid-period shouldn't look "missed" for
 * days before it even existed), and never past today (no counting future
 * days as missed).
 *
 * Formerly "Supplement-Treue", shown as a plain percentage. Same underlying
 * math (checked slots ÷ total slots), 1:1 renamed to a 0-100 point score
 * per explicit request — "ein bisschen mehr Gamification". A point score
 * reads as something to chase in a way a percentage doesn't quite (nobody
 * says "I scored 80 percent today" out loud the way they'd say "I scored 80
 * points"), which is the entire difference here: the number itself is
 * unchanged, only what it's called and how it's framed.
 */
export function SupplementScoreCard({ startKey, endKey }: { startKey: string; endKey: string }) {
  const mySupplements = useMySupplements()
  const supplements = useAllSupplements()
  const logEntries = useSupplementLogInRange(startKey, endKey)

  // Computed before the early returns below, and guarding internally instead.
  // A hook after a conditional return is called in a different order on
  // different renders, which React forbids outright.
  const rows = useMemo(() => {
    if (!mySupplements || !supplements || !logEntries) return []
    const todayKey = toLocalDateKey(new Date())
    const effectiveEndKey = endKey > todayKey ? todayKey : endKey
    const supplementById = new Map(supplements.map((s) => [s.id, s]))

    return mySupplements.map((my) => {
      const createdKey = toLocalDateKey(new Date(my.createdAt))
      const effectiveStartKey = createdKey > startKey ? createdKey : startKey
      // A Set, not an array: `days.includes(...)` inside the filter below was a
      // linear scan per log entry per supplement. On the Jahr view with twenty
      // supplements that is a 365-element search run for each of thousands of
      // entries, twenty times over — tens of millions of string comparisons,
      // and redone on every render of the page.
      const days =
        effectiveStartKey <= effectiveEndKey
          ? new Set(daysBetween(effectiveStartKey, effectiveEndKey))
          : new Set<string>()
      const totalSlots = days.size * my.timesOfDay.length
      // Also filtered by whether the slot is still part of the routine. Without
      // that, check-ins for a time of day the user has since removed keep
      // counting against a denominator that no longer includes them — a
      // supplement dropped from twice to once a day then reported 14/7, i.e.
      // 200% adherence, and inflated the overall figure with it.
      const activeTimes = new Set(my.timesOfDay)
      const checkedSlots = logEntries.filter(
        (e) => e.mySupplementId === my.id && days.has(e.date) && activeTimes.has(e.timeOfDay),
      ).length
      return {
        id: my.id,
        name: supplementById.get(my.supplementId)?.name ?? 'Supplement',
        totalSlots,
        checkedSlots,
      }
    })
  }, [mySupplements, supplements, logEntries, startKey, endKey])

  if (!mySupplements || !supplements || !logEntries) return null
  if (mySupplements.length === 0) return null

  const totalSlots = rows.reduce((sum, r) => sum + r.totalSlots, 0)
  const checkedSlots = rows.reduce((sum, r) => sum + r.checkedSlots, 0)
  const overallScore = totalSlots > 0 ? Math.round((checkedSlots / totalSlots) * 100) : null

  return (
    <GlassSurface rim={24} as="div" className="glass-subtle glass-subtle-themed mt-4 rounded-3xl p-5 shadow-sm shadow-black/5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Supplementscore</h2>
        {overallScore !== null && (
          <span className="flex items-baseline gap-1">
            <TrophyIcon
              className={`h-4 w-4 ${overallScore >= GOOD_SCORE_THRESHOLD ? 'text-accent' : 'text-ink-faint'}`}
            />
            <span className="text-lg font-bold text-accent">{overallScore}</span>
            <span className="text-xs font-medium text-ink-soft">/ 100</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const score = r.totalSlots > 0 ? Math.round((r.checkedSlots / r.totalSlots) * 100) : null
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink-soft">{r.name}</span>
              <span className="shrink-0 text-xs text-ink-soft">
                {score === null ? '–' : `${r.checkedSlots}/${r.totalSlots} · ${score} Pkt.`}
              </span>
            </div>
          )
        })}
      </div>
      {overallScore !== null && overallScore >= GOOD_SCORE_THRESHOLD && (
        <p className="mt-3 text-xs font-medium text-accent">Stark dabei — weiter so!</p>
      )}
    </GlassSurface>
  )
}

function TrophyIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 12v3M9 19h6M10 19v-2.5a2 2 0 0 1 4 0V19" />
    </svg>
  )
}
