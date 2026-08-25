import { toLocalDateKey, type Nutrition } from './db'

export type Period = 'day' | 'week' | 'month' | 'year'

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday-based ISO week start. */
export function startOfWeek(date: Date): Date {
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

/**
 * One point on a statistics chart.
 *
 * Carries all four macros, not just kcal: tapping a point opens the same
 * nutrient rings the rest of the app uses, and a bucket that only knew its
 * calories would have had to go back to the database to answer that.
 */
export interface StatBucket {
  key: string
  label: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Alias kept for readability at call sites that deal specifically in days. */
export type DayBucket = StatBucket

const EMPTY: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

function addInto(target: StatBucket, add: Nutrition | undefined): void {
  if (!add) return
  target.kcal += add.kcal
  target.protein += add.protein
  target.carbs += add.carbs
  target.fat += add.fat
}

export function bucketByDay(startKey: string, endKey: string, byDate: Map<string, Nutrition>): StatBucket[] {
  const buckets: StatBucket[] = []
  let cur = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  while (cur <= end) {
    const key = toLocalDateKey(cur)
    // Day number only — the month is shown once as a heading above the chart instead.
    const bucket: StatBucket = { key, label: String(cur.getDate()), ...EMPTY }
    addInto(bucket, byDate.get(key))
    buckets.push(bucket)
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
  return buckets
}

export const FULL_MONTH_LABELS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/** "August" if the whole range falls in one month, "Juli/August" if it spans two (e.g. a week crossing a month boundary). */
export function monthHeadingLabel(startKey: string, endKey: string): string {
  const start = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  const startLabel = FULL_MONTH_LABELS[start.getMonth()]
  const endLabel = FULL_MONTH_LABELS[end.getMonth()]
  return startLabel === endLabel ? startLabel : `${startLabel}/${endLabel}`
}

export type MonthBucket = StatBucket

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

export function bucketByMonth(year: number, byDate: Map<string, Nutrition>): StatBucket[] {
  const buckets: StatBucket[] = MONTH_LABELS.map((label, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    label,
    ...EMPTY,
  }))
  for (const [dateKey, nutrition] of byDate) {
    const [y, m] = dateKey.split('-').map(Number)
    if (y === year) addInto(buckets[m - 1], nutrition)
  }
  return buckets
}

/** `key` is the Monday date-key of the week — usable as the anchor when drilling into the Woche view. */
export type WeekBucket = StatBucket

/** ISO-8601 week number (1–53) for a date, based on the Monday-start week containing it. */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3) // nearest Thursday decides the ISO year/week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

/** Buckets a range (typically a month) into calendar weeks (Monday-start) — used for the Monat chart, where each bar is a clickable week. Labeled "KW{n}" (short enough for ~5 bars to fit without overlapping, unlike a full date range). */
export function bucketByWeek(startKey: string, endKey: string, byDate: Map<string, Nutrition>): StatBucket[] {
  const buckets = new Map<string, StatBucket>()
  let cur = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  while (cur <= end) {
    const weekStart = startOfWeek(cur)
    const weekKey = toLocalDateKey(weekStart)
    if (!buckets.has(weekKey)) {
      buckets.set(weekKey, { key: weekKey, label: `KW${isoWeekNumber(weekStart)}`, ...EMPTY })
    }
    addInto(buckets.get(weekKey)!, byDate.get(toLocalDateKey(cur)))
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
  return [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
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

