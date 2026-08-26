import { useMemo } from 'react'
import { toLocalDateKey } from '../lib/db'
import { useMySupplements, useSupplementLogInRange, useAllSupplements } from '../hooks/useSupplements'

function daysBetween(startKey: string, endKey: string): string[] {
  const start = new Date(`${startKey}T00:00:00`)
  const end = new Date(`${endKey}T00:00:00`)
  const days: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toLocalDateKey(d))
  }
  return days
}

/**
 * "Supplement-Treue" for whichever period Statistik currently has selected
 * (Tag/Woche/Monat/Jahr) — how many of the configured daily slots actually
 * got checked off, both overall and per supplement. Only counts days from
 * whichever is later of the period's start or the supplement's own
 * createdAt (a supplement added mid-period shouldn't look "missed" for
 * days before it even existed), and never past today (no counting future
 * days as missed).
 */
export function SupplementAdherenceCard({ startKey, endKey }: { startKey: string; endKey: string }) {
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
  const overallPercent = totalSlots > 0 ? Math.round((checkedSlots / totalSlots) * 100) : null

  return (
    <div className="glass-subtle glass-subtle-themed mt-4 rounded-3xl p-5 shadow-sm shadow-black/5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Supplement-Treue</h2>
        {overallPercent !== null && <span className="text-sm font-bold text-accent">{overallPercent}%</span>}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const percent = r.totalSlots > 0 ? Math.round((r.checkedSlots / r.totalSlots) * 100) : null
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink-soft">{r.name}</span>
              <span className="shrink-0 text-xs text-ink-soft">
                {percent === null ? '–' : `${r.checkedSlots}/${r.totalSlots} · ${percent}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
