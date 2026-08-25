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

  if (!mySupplements || !supplements || !logEntries) return null
  if (mySupplements.length === 0) return null

  const todayKey = toLocalDateKey(new Date())
  const effectiveEndKey = endKey > todayKey ? todayKey : endKey
  const supplementById = new Map(supplements.map((s) => [s.id, s]))

  const rows = mySupplements.map((my) => {
    const createdKey = toLocalDateKey(new Date(my.createdAt))
    const effectiveStartKey = createdKey > startKey ? createdKey : startKey
    const days = effectiveStartKey <= effectiveEndKey ? daysBetween(effectiveStartKey, effectiveEndKey) : []
    const totalSlots = days.length * my.timesOfDay.length
    const checkedSlots = logEntries.filter((e) => e.mySupplementId === my.id && days.includes(e.date)).length
    return {
      id: my.id,
      name: supplementById.get(my.supplementId)?.name ?? 'Supplement',
      totalSlots,
      checkedSlots,
    }
  })

  const totalSlots = rows.reduce((sum, r) => sum + r.totalSlots, 0)
  const checkedSlots = rows.reduce((sum, r) => sum + r.checkedSlots, 0)
  const overallPercent = totalSlots > 0 ? Math.round((checkedSlots / totalSlots) * 100) : null

  return (
    <div className="glass-subtle mt-4 rounded-3xl p-5 shadow-sm shadow-black/5">
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
