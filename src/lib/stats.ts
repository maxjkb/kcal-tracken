import { toLocalDateKey } from './db'

export type Period = 'day' | 'week' | 'month' | 'year'

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday-based ISO week start. */
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getPeriodRange(period: Period, anchorKey: string): { startKey: string; endKey: string } {
  const anchor = parseDateKey(anchorKey)
  if (period === 'day') {
    return { startKey: anchorKey, endKey: anchorKey }
  }
  if (period === 'week') {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { startKey: toLocalDateKey(start), endKey: toLocalDateKey(end) }
  }
  if (period === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return { startKey: toLocalDateKey(start), endKey: toLocalDateKey(end) }
  }
  const start = new Date(anchor.getFullYear(), 0, 1)
  const end = new Date(anchor.getFullYear(), 11, 31)
  return { startKey: toLocalDateKey(start), endKey: toLocalDateKey(end) }
}

export function shiftAnchor(period: Period, anchorKey: string, delta: number): string {
  const anchor = parseDateKey(anchorKey)
  if (period === 'day') anchor.setDate(anchor.getDate() + delta)
  else if (period === 'week') anchor.setDate(anchor.getDate() + delta * 7)
  else if (period === 'month') anchor.setMonth(anchor.getMonth() + delta)
  else anchor.setFullYear(anchor.getFullYear() + delta)
  return toLocalDateKey(anchor)
}

export function formatPeriodLabel(period: Period, anchorKey: string): string {
  const anchor = parseDateKey(anchorKey)
  if (period === 'day') {
    const todayKey = toLocalDateKey(new Date())
    if (anchorKey === todayKey) return 'Heute'
    return anchor.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
  }
  if (period === 'week') {
    const { startKey, endKey } = getPeriodRange('week', anchorKey)
    const s = parseDateKey(startKey)
    const e = parseDateKey(endKey)
    return `${s.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${e.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }
  if (period === 'month') {
    return anchor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  }
  return String(anchor.getFullYear())
}

export interface DayBucket {
  key: string
  label: string
  kcal: number
}

export function bucketByDay(startKey: string, endKey: string, kcalByDate: Map<string, number>): DayBucket[] {
  const buckets: DayBucket[] = []
  let cur = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  while (cur <= end) {
    const key = toLocalDateKey(cur)
    buckets.push({
      key,
      label: cur.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      kcal: kcalByDate.get(key) ?? 0,
    })
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
  return buckets
}

export interface MonthBucket {
  key: string
  label: string
  kcal: number
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

export function bucketByMonth(year: number, kcalByDate: Map<string, number>): MonthBucket[] {
  const sums = new Array(12).fill(0)
  for (const [dateKey, kcal] of kcalByDate) {
    const [y, m] = dateKey.split('-').map(Number)
    if (y === year) sums[m - 1] += kcal
  }
  return sums.map((kcal, i) => ({ key: `${year}-${String(i + 1).padStart(2, '0')}`, label: MONTH_LABELS[i], kcal }))
}

/** Average daily kcal over days that have already elapsed within the range (never counts future days). */
export function computeDailyAverage(startKey: string, endKey: string, totalKcal: number): number {
  const todayKey = toLocalDateKey(new Date())
  const effectiveEndKey = endKey < todayKey ? endKey : todayKey
  if (effectiveEndKey < startKey) return 0
  const start = parseDateKey(startKey)
  const end = parseDateKey(effectiveEndKey)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return totalKcal / Math.max(1, days)
}

export interface MacroTotals {
  protein: number
  carbs: number
  fat: number
}

/** Same elapsed-days logic as computeDailyAverage, applied to each macro at once. */
export function computeDailyMacroAverages(startKey: string, endKey: string, totals: MacroTotals): MacroTotals {
  const todayKey = toLocalDateKey(new Date())
  const effectiveEndKey = endKey < todayKey ? endKey : todayKey
  if (effectiveEndKey < startKey) return { protein: 0, carbs: 0, fat: 0 }
  const start = parseDateKey(startKey)
  const end = parseDateKey(effectiveEndKey)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  return {
    protein: totals.protein / days,
    carbs: totals.carbs / days,
    fat: totals.fat / days,
  }
}
