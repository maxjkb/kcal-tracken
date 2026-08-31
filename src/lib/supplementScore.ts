import { toLocalDateKey, type MySupplement, type Supplement, type SupplementLogEntry } from './db'

export interface SupplementScoreRow {
  id: string
  name: string
  totalSlots: number
  checkedSlots: number
}

export interface SupplementScoreOverview {
  rows: SupplementScoreRow[]
  totalSlots: number
  checkedSlots: number
  overallScore: number | null
}

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
 * The Supplementscore, cumulative since each entry's own createdAt through
 * today — no longer bound to whichever period Statistik happens to have
 * selected (Tag/Woche/Monat/Jahr used to reset the whole picture back to a
 * near-empty denominator the moment you switched tabs, which read as the
 * score itself resetting). "Fortlaufend": every day ever tracked stays in
 * the denominator forever, so the number only ever accumulates more
 * history, exactly like a running total is expected to behave.
 *
 * Same underlying math as the period-bound version it replaces — checked
 * slots ÷ total slots, only counting whichever is later of the supplement's
 * own createdAt or its earliest possible day (there is no period start to
 * clamp against any more), and never past today. A slot for a time-of-day
 * since removed from the entry is excluded the same way, so a supplement
 * dropped from twice to once daily doesn't drag the total above 100%.
 */
export function computeSupplementScore(
  mySupplements: MySupplement[],
  supplements: Supplement[],
  logEntries: SupplementLogEntry[],
): SupplementScoreOverview {
  const todayKey = toLocalDateKey(new Date())
  const supplementById = new Map(supplements.map((s) => [s.id, s]))

  const rows: SupplementScoreRow[] = mySupplements.map((my) => {
    const startKey = toLocalDateKey(new Date(my.createdAt))
    const days = startKey <= todayKey ? new Set(daysBetween(startKey, todayKey)) : new Set<string>()
    const totalSlots = days.size * my.timesOfDay.length
    const activeTimes = new Set(my.timesOfDay)
    const checkedSlots = logEntries.filter(
      (e) => e.mySupplementId === my.id && days.has(e.date) && activeTimes.has(e.timeOfDay),
    ).length
    return {
      id: my.id,
      name: supplementById.get(my.supplementId)?.name ?? 'Supp',
      totalSlots,
      checkedSlots,
    }
  })

  const totalSlots = rows.reduce((sum, r) => sum + r.totalSlots, 0)
  const checkedSlots = rows.reduce((sum, r) => sum + r.checkedSlots, 0)
  const overallScore = totalSlots > 0 ? Math.round((checkedSlots / totalSlots) * 100) : null

  return { rows, totalSlots, checkedSlots, overallScore }
}
