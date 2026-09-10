import { useLiveQuery } from 'dexie-react-hooks'
import { db, toLocalDateKey, type Nutrition, type SickDay } from './db'
import { computeDailyTargets, getBodyProfile } from './bodyProfile'
import { estimateIllnessTargets } from './gemini'

/** How far back "recent eating habits" looks when grounding an on-request target suggestion — long enough to smooth over a couple of one-off days, short enough to still reflect how the user eats right now. */
const RECENT_HABITS_DAYS = 30

/** Single day, live. `undefined` while loading, `null` when the day isn't marked sick at all. */
export function useSickDay(dateKey: string): SickDay | null | undefined {
  return useLiveQuery(async () => (await db.sickDays.get(dateKey)) ?? null, [dateKey])
}

/** Set of date keys marked sick within a range — for the calendar's red-digit marker, mirroring useMealsInRange's daysWithMeals pattern. */
export function useSickDaysInRange(startKey: string, endKey: string): Set<string> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.sickDays.where('date').between(startKey, endKey, true, true).toArray()
    return new Set(rows.map((r) => r.date))
  }, [startKey, endKey])
}

/**
 * Instant on/off toggle — the sick-day button's single-tap behavior. Creates
 * a bare row (no category/note yet) when turning on; removes the row
 * entirely when turning off, rather than leaving a "not sick" row behind.
 */
export async function toggleSickDay(dateKey: string): Promise<boolean> {
  const existing = await db.sickDays.get(dateKey)
  if (existing) {
    await db.sickDays.delete(dateKey)
    return false
  }
  const now = Date.now()
  await db.sickDays.put({ date: dateKey, createdAt: now, updatedAt: now })
  return true
}

/** Saves the detail Sheet's fields (category/note/adjustTargets) without touching any existing targetOverride. */
export async function saveSickDayDetails(
  dateKey: string,
  details: { category?: SickDay['category']; note?: string; adjustTargets?: boolean },
): Promise<void> {
  const existing = await db.sickDays.get(dateKey)
  const now = Date.now()
  await db.sickDays.put({
    date: dateKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    targetOverride: existing?.targetOverride,
    ...details,
  })
}

/**
 * Average daily intake over the last RECENT_HABITS_DAYS, excluding the day
 * itself and any other day already marked sick — grounds the AI's suggestion
 * in how the user actually eats on a normal day, not in a sick stretch that
 * happened to precede it. Returns null when there's not enough history to
 * say anything meaningful (fewer than 5 normal days logged).
 */
async function computeRecentNormalAverage(excludeDateKey: string): Promise<Nutrition | null> {
  const startKey = toLocalDateKey(new Date(Date.now() - RECENT_HABITS_DAYS * 86_400_000))
  const [meals, sickRows] = await Promise.all([
    db.meals.where('date').aboveOrEqual(startKey).toArray(),
    db.sickDays.where('date').aboveOrEqual(startKey).toArray(),
  ])
  const excluded = new Set(sickRows.map((r) => r.date))
  excluded.add(excludeDateKey)

  const byDate = new Map<string, Nutrition>()
  for (const m of meals) {
    if (excluded.has(m.date)) continue
    const acc = byDate.get(m.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    acc.kcal += m.nutrition.kcal
    acc.protein += m.nutrition.protein
    acc.carbs += m.nutrition.carbs
    acc.fat += m.nutrition.fat
    byDate.set(m.date, acc)
  }

  const days = [...byDate.values()]
  if (days.length < 5) return null

  const sum = days.reduce(
    (acc, d) => ({ kcal: acc.kcal + d.kcal, protein: acc.protein + d.protein, carbs: acc.carbs + d.carbs, fat: acc.fat + d.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return { kcal: sum.kcal / days.length, protein: sum.protein / days.length, carbs: sum.carbs / days.length, fat: sum.fat / days.length }
}

/**
 * Runs the on-request AI computation for one sick day and stores the result
 * on that day's SickDay row — ONLY called from the detail Sheet's "Nährwerte
 * anpassen" action, never automatically (see estimateIllnessTargets's own
 * doc comment for why). Returns the computed result so the Sheet can show it
 * immediately without waiting on the live query to catch up.
 */
export async function requestIllnessTargetAdjustment(dateKey: string): Promise<NonNullable<SickDay['targetOverride']>> {
  const profile = getBodyProfile()
  const normalTargets = profile ? computeDailyTargets(profile) : { kcal: 2000, protein: 100, carbs: 200, fat: 70 }
  const sickDay = await db.sickDays.get(dateKey)
  const recentAverage = await computeRecentNormalAverage(dateKey)

  const result = await estimateIllnessTargets({
    normalTargets,
    bodyProfile: profile,
    category: sickDay?.category,
    note: sickDay?.note,
    recentAverage,
  })

  const targetOverride = { ...result, computedAt: Date.now() }
  const now = Date.now()
  await db.sickDays.put({
    date: dateKey,
    category: sickDay?.category,
    note: sickDay?.note,
    adjustTargets: true,
    createdAt: sickDay?.createdAt ?? now,
    updatedAt: now,
    targetOverride,
  })
  return targetOverride
}
