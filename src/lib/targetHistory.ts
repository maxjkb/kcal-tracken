import { useLiveQuery } from 'dexie-react-hooks'
import { db, toLocalDateKey, type Nutrition } from './db'
import { computeDailyTargets, getBodyProfile } from './bodyProfile'
import type { StatBucket } from './stats'

/**
 * Freezes today's kcal target the first time today is ever seen, so it can
 * never drift later.
 *
 * Idempotent by construction — a row already existing for today is left
 * untouched, so calling this on every app launch (see main.tsx) and again
 * right after a body-profile edit (see BodyProfilePage) is exactly as safe
 * as calling it once: whichever of those happens first each day wins, and
 * every later call that same day is a no-op. In a transaction for the same
 * reason as the identical read-then-write pattern in
 * useSupplements.ts/toggleSupplementCheck and supplementAdvisor.ts/
 * generateAdvisorRun — two of these firing close together (app boot racing
 * a same-second profile save) must not both see "nothing for today yet" and
 * both insert.
 */
export async function recordTodaysTargetSnapshot(): Promise<void> {
  const profile = getBodyProfile()
  if (!profile) return
  const today = toLocalDateKey(new Date())
  const kcal = Math.round(computeDailyTargets(profile).kcal)

  await db.transaction('rw', db.dailyTargetSnapshots, async () => {
    const existing = await db.dailyTargetSnapshots.get(today)
    if (!existing) await db.dailyTargetSnapshots.put({ date: today, kcal })
  })
}

/**
 * The kcal target that applied on each day in [startKey, endKey] — frozen
 * history where one was ever recorded, today's live target everywhere else.
 *
 * That fallback covers three cases identically, which is exactly the point:
 * a day before this feature shipped, a day nobody happened to open the app
 * on (so recordTodaysTargetSnapshot never ran for it), and a day still in
 * the future all show today's current target, because none of them has a
 * frozen value of their own — there is nothing to distinguish "not tracked
 * yet" from "not tracked at all" once a row is simply missing, and there
 * doesn't need to be.
 *
 * Returns undefined while the range is still loading (useLiveQuery's own
 * convention) and null once loaded but no body profile exists at all —
 * callers use that to hide the target line entirely, same as every other
 * `DailyTargets | null` consumer in the app.
 */
export function useDailyTargetKcalMap(startKey: string, endKey: string): Map<string, number> | null | undefined {
  return useLiveQuery(async () => {
    const profile = getBodyProfile()
    if (!profile) return null
    const currentKcal = Math.round(computeDailyTargets(profile).kcal)

    const snapshots = await db.dailyTargetSnapshots.where('date').between(startKey, endKey, true, true).toArray()
    const byDate = new Map(snapshots.map((s) => [s.date, s.kcal]))

    const map = new Map<string, number>()
    for (let cur = new Date(`${startKey}T00:00:00`); toLocalDateKey(cur) <= endKey; cur.setDate(cur.getDate() + 1)) {
      const key = toLocalDateKey(cur)
      map.set(key, byDate.get(key) ?? currentKcal)
    }
    return map
  }, [startKey, endKey])
}

/**
 * Buckets a per-day target-kcal map the exact same way lib/stats.ts buckets
 * actual intake (bucketByDay/Week/Month), so the target line's points line
 * up with the kcal line's points bucket-for-bucket — reusing those functions
 * directly rather than re-deriving day/week/month boundaries a second time.
 * They sum a `Nutrition` map, so the target values ride along in the `kcal`
 * field with the other three macros left at 0.
 */
export function targetKcalAsNutritionMap(targetKcalByDate: Map<string, number>): Map<string, Nutrition> {
  const map = new Map<string, Nutrition>()
  for (const [date, kcal] of targetKcalByDate) {
    map.set(date, { kcal, protein: 0, carbs: 0, fat: 0 })
  }
  return map
}

/** Reduces bucketed target data down to just `key -> target kcal`, for merging into the buckets actually charted. */
export function targetKcalByBucketKey(buckets: StatBucket[]): Map<string, number> {
  return new Map(buckets.map((b) => [b.key, b.kcal]))
}
