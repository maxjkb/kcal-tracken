import { db, newTipsRunId, toLocalDateKey, type MealType, type Nutrition, type TipsRun } from './db'
import { estimateNutritionTips } from './gemini'
import { computeDailyTargets, getBodyProfile } from './bodyProfile'
import { guessMealType } from './mealTypeGuess'
import { MEAL_TYPE_LABELS } from './db'
import { getApiKey } from './settings'

/** How long past runs are kept — just enough that "was heute schon vorgeschlagen" survives a slot change, not a history anyone browses. */
const RETENTION_DAYS = 2

/** The newest stored tips run, or undefined if none exists yet on this device. */
export async function getLatestTipsRun(): Promise<TipsRun | undefined> {
  return db.tipRuns.orderBy('generatedAt').last()
}

/**
 * True once the newest run is from a different day, or from a different
 * time-of-day slot than right now — the four-times-a-day cadence, aligned to
 * the same breakfast/lunch/snack/dinner windows `guessMealType` already uses
 * to default a new meal's type, so tips move in step with the meal the user
 * is actually approaching rather than on an arbitrary clock.
 */
export function isTipsRunStale(run: TipsRun | undefined): boolean {
  return !run || run.date !== toLocalDateKey(new Date()) || run.slot !== guessMealType()
}

async function todaysIntake(): Promise<{ consumed: Nutrition; titles: string[] }> {
  const today = toLocalDateKey(new Date())
  const meals = await db.meals.where('date').equals(today).toArray()
  const consumed = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.nutrition.kcal,
      protein: acc.protein + m.nutrition.protein,
      carbs: acc.carbs + m.nutrition.carbs,
      fat: acc.fat + m.nutrition.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return { consumed, titles: meals.map((m) => m.title) }
}

async function pruneOldRuns(): Promise<void> {
  const cutoff = toLocalDateKey(new Date(Date.now() - (RETENTION_DAYS - 1) * 86_400_000))
  const stale = await db.tipRuns.where('date').below(cutoff).primaryKeys()
  if (stale.length > 0) await db.tipRuns.bulkDelete(stale)
}

/**
 * Produces this slot's tips and stores them, replacing any run already
 * stored for the same (date, slot) pair rather than adding a second one.
 */
export async function generateTipsRun(): Promise<TipsRun> {
  const [{ consumed, titles }, bodyProfile] = [await todaysIntake(), getBodyProfile()]
  const slot: MealType = guessMealType()
  const dailyTargets = bodyProfile ? computeDailyTargets(bodyProfile) : null

  const tips = await estimateNutritionTips({
    slotLabel: MEAL_TYPE_LABELS[slot],
    dailyTargets,
    consumedSoFar: consumed,
    loggedTitles: titles,
  })

  const today = toLocalDateKey(new Date())
  const existing = await db.tipRuns.where('[date+slot]').equals([today, slot]).primaryKeys()
  if (existing.length > 0) await db.tipRuns.bulkDelete(existing)

  const run: TipsRun = {
    id: newTipsRunId(),
    date: today,
    slot,
    generatedAt: Date.now(),
    tips,
    context: { slot, dailyTargets, consumedSoFar: consumed, loggedTitles: titles },
  }
  await db.tipRuns.add(run)
  await pruneOldRuns()
  return run
}

/**
 * The automatic refresh, called on app start (mirrors
 * lib/supplementAdvisor.ts's refreshAdvisorIfStale — same reasoning: silent
 * and best-effort, since this runs unattended and a spent quota or missing
 * key must not surface as an error nobody asked to see). The Tipps sheet
 * itself does its own explicit, error-surfacing refresh on open, since a
 * session left open across a slot boundary needs a chance to catch up
 * without waiting for the next app launch.
 */
export async function refreshTipsIfStale(): Promise<void> {
  if (!getApiKey()) return
  const latest = await getLatestTipsRun()
  if (!isTipsRunStale(latest)) return
  try {
    await generateTipsRun()
  } catch {
    // Intentionally silent — see above.
  }
}
