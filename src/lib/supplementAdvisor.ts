import {
  db,
  MICRONUTRIENT_LABELS,
  newSupplementAdvisorRunId,
  toLocalDateKey,
  type Nutrition,
  type SupplementAdvisorContext,
  type SupplementAdvisorRun,
} from './db'
import { estimateSupplementRecommendations } from './gemini'
import { computeDailyTargets, getBodyProfile, GOAL_LABELS } from './bodyProfile'
import { computeMicronutrientOverview } from './micronutrients'
import { getApiKey } from './settings'

/** Window the intake analysis looks back over. */
export const ADHERENCE_WINDOW_DAYS = 30
/** Days taken within that window at which a supplement counts as settled routine and is no longer suggested. */
export const ESTABLISHED_DAYS = 27
/**
 * Below this many days on the list there simply isn't enough history to judge
 * regularity, so a brand-new entry is left alone rather than being told off
 * for a streak it hasn't had time to build.
 */
const MIN_DAYS_TO_JUDGE = 7
/** How long past runs are kept — the memory that makes advice stable, not an archive. */
const RETENTION_DAYS = 7
/** Nutrition window the suggestions themselves are grounded in. */
const INTAKE_WINDOW_DAYS = 14
/** A macro has to move by more than this share of its previous value to count as a real change. */
const MATERIAL_CHANGE_RATIO = 0.15

function daysAgoKey(days: number): string {
  return toLocalDateKey(new Date(Date.now() - days * 86_400_000))
}

export interface SupplementAdherence {
  name: string
  /** Distinct days with at least one check-in inside the window. */
  daysTaken: number
  /** Days the entry has actually been on the list, capped at the window — the honest denominator. */
  daysTracked: number
  established: boolean
}

/**
 * How consistently each supplement on the user's list has actually been taken
 * over the last month.
 *
 * Counts *days with at least one check-in*, not individual slots: someone who
 * takes magnesium every evening as intended should read as fully consistent,
 * and counting slots would punish an entry simply for being scheduled twice
 * a day. The denominator is how long the entry has been on the list rather
 * than a flat 30, so adding something yesterday doesn't immediately show up
 * as a 1-of-30 failure.
 */
export async function analyzeAdherence(): Promise<SupplementAdherence[]> {
  const [mySupplements, catalog] = await Promise.all([db.mySupplements.toArray(), db.supplements.toArray()])
  if (mySupplements.length === 0) return []

  const startKey = daysAgoKey(ADHERENCE_WINDOW_DAYS - 1)
  const todayKey = toLocalDateKey(new Date())
  const log = await db.supplementLog.where('date').between(startKey, todayKey, true, true).toArray()

  const daysById = new Map<string, Set<string>>()
  for (const entry of log) {
    const set = daysById.get(entry.mySupplementId) ?? new Set<string>()
    set.add(entry.date)
    daysById.set(entry.mySupplementId, set)
  }

  const nameById = new Map(catalog.map((s) => [s.id, s.name]))

  return mySupplements.map((my) => {
    const name = nameById.get(my.supplementId) ?? 'Unbekanntes Supplement'
    const daysTaken = daysById.get(my.id)?.size ?? 0
    const daysSinceAdded = Math.floor((Date.now() - my.createdAt) / 86_400_000) + 1
    const daysTracked = Math.max(1, Math.min(ADHERENCE_WINDOW_DAYS, daysSinceAdded))

    // Too new to have a track record: treated as settled so it is neither
    // re-suggested nor nagged about.
    const tooNewToJudge = daysTracked < MIN_DAYS_TO_JUDGE
    const established = tooNewToJudge || daysTaken >= Math.min(ESTABLISHED_DAYS, daysTracked)

    return { name, daysTaken, daysTracked, established }
  })
}

/** Average daily macros over the intake window, plus how many days actually carried data. */
async function analyzeIntake(): Promise<{ average: Nutrition; periodDays: number }> {
  const startKey = daysAgoKey(INTAKE_WINDOW_DAYS - 1)
  const todayKey = toLocalDateKey(new Date())
  const meals = await db.meals.where('date').between(startKey, todayKey, true, true).toArray()

  const totals = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.nutrition.kcal,
      protein: acc.protein + m.nutrition.protein,
      carbs: acc.carbs + m.nutrition.carbs,
      fat: acc.fat + m.nutrition.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const periodDays = Math.max(1, new Set(meals.map((m) => m.date)).size)

  return {
    average: {
      kcal: totals.kcal / periodDays,
      protein: totals.protein / periodDays,
      carbs: totals.carbs / periodDays,
      fat: totals.fat / periodDays,
    },
    periodDays,
  }
}

/**
 * What actually moved between two runs, in words the model can act on — or
 * null when nothing did, which is the signal to leave the previous advice
 * exactly as it stood.
 *
 * A relative threshold rather than an absolute one: 20 g of protein is a real
 * shift for someone eating 90 g a day and noise for someone eating 220 g.
 */
function describeNutritionChange(previous: SupplementAdvisorContext, current: SupplementAdvisorContext): string | null {
  const labels: [keyof Nutrition, string, string][] = [
    ['kcal', 'Kalorienzufuhr', 'kcal'],
    ['protein', 'Proteinzufuhr', 'g'],
    ['carbs', 'Kohlenhydratzufuhr', 'g'],
    ['fat', 'Fettzufuhr', 'g'],
  ]

  const changes: string[] = []
  for (const [key, label, unit] of labels) {
    const before = previous.averageIntake[key]
    const after = current.averageIntake[key]
    if (before <= 0) continue
    const delta = after - before
    if (Math.abs(delta) / before < MATERIAL_CHANGE_RATIO) continue
    const direction = delta > 0 ? 'gestiegen' : 'gesunken'
    changes.push(`${label} ${direction} von ${Math.round(before)} auf ${Math.round(after)} ${unit}/Tag`)
  }

  if (previous.goalLabel !== current.goalLabel) {
    changes.push(`Körperziel gewechselt von "${previous.goalLabel}" zu "${current.goalLabel}"`)
  }

  const newlyEstablished = current.established.filter((n) => !previous.established.includes(n))
  if (newlyEstablished.length > 0) {
    changes.push(`wird inzwischen regelmäßig eingenommen: ${newlyEstablished.join(', ')}`)
  }

  const newlyLow = current.lowMicronutrients.filter((n) => !previous.lowMicronutrients.includes(n))
  if (newlyLow.length > 0) {
    changes.push(`neu unterrepräsentiert (7-Tage-Schnitt): ${newlyLow.join(', ')}`)
  }
  const noLongerLow = previous.lowMicronutrients.filter((n) => !current.lowMicronutrients.includes(n))
  if (noLongerLow.length > 0) {
    changes.push(`nicht mehr unterrepräsentiert: ${noLongerLow.join(', ')}`)
  }

  return changes.length > 0 ? changes.join('; ') : null
}

/** The most recent run, or undefined if the advisor has never run on this device. */
export async function getLatestAdvisorRun(): Promise<SupplementAdvisorRun | undefined> {
  return db.supplementAdvisorRuns.orderBy('generatedAt').last()
}

/** True once the newest run is from an earlier day than today — the once-a-day trigger. */
export function isRunStale(run: SupplementAdvisorRun | undefined): boolean {
  return !run || run.date !== toLocalDateKey(new Date())
}

async function pruneOldRuns(): Promise<void> {
  const cutoff = daysAgoKey(RETENTION_DAYS - 1)
  const stale = await db.supplementAdvisorRuns.where('date').below(cutoff).primaryKeys()
  if (stale.length > 0) await db.supplementAdvisorRuns.bulkDelete(stale)
}

/**
 * Produces today's suggestions and stores them.
 *
 * The previous run is handed to the model together with a description of what
 * has changed since, which is what turns this from "generate a fresh list"
 * into "revise the standing advice". Runs older than a week are pruned: they
 * are working memory for consistency, not a history the user ever sees.
 *
 * Replaces any run already stored for today rather than adding a second one,
 * so a manual re-trigger can't leave two competing lists for the same day.
 */
export async function generateAdvisorRun(): Promise<SupplementAdvisorRun> {
  const bodyProfile = getBodyProfile()
  const [adherence, intake, microOverview] = await Promise.all([
    analyzeAdherence(),
    analyzeIntake(),
    // Same rolling 7-day picture the Statistik page shows — no separate,
    // hidden window here, so "why is this suggested" always matches what's
    // visible elsewhere in the app. Skipped without a body profile, same
    // gate the bands themselves need (iron's reference value depends on sex).
    bodyProfile ? computeMicronutrientOverview(toLocalDateKey(new Date()), bodyProfile.sex) : null,
  ])

  const established = adherence.filter((a) => a.established)
  const irregular = adherence.filter((a) => !a.established)
  const lowMicronutrients = (microOverview?.statuses ?? [])
    .filter((s) => s.band === 'low')
    .map((s) => MICRONUTRIENT_LABELS[s.key])

  const context: SupplementAdvisorContext = {
    goalLabel: bodyProfile ? GOAL_LABELS[bodyProfile.goal] : 'Kein Ziel hinterlegt',
    dailyTargets: bodyProfile ? computeDailyTargets(bodyProfile) : null,
    averageIntake: intake.average,
    periodDays: intake.periodDays,
    established: established.map((a) => a.name),
    lowMicronutrients,
  }

  const previousRun = await getLatestAdvisorRun()
  const nutritionChange = previousRun ? describeNutritionChange(previousRun.context, context) : null

  const suggestions = await estimateSupplementRecommendations({
    goalLabel: context.goalLabel,
    dailyTargets: context.dailyTargets,
    averageIntake: context.averageIntake,
    periodDays: context.periodDays,
    established: context.established,
    irregular: irregular.map((a) => ({ name: a.name, daysTaken: a.daysTaken, daysTracked: a.daysTracked })),
    lowMicronutrients: context.lowMicronutrients,
    previous: previousRun ? previousRun.suggestions.map((s) => ({ supplementName: s.supplementName, reasoning: s.reasoning })) : null,
    nutritionChange,
  })

  const today = toLocalDateKey(new Date())
  const existingToday = await db.supplementAdvisorRuns.where('date').equals(today).primaryKeys()
  if (existingToday.length > 0) await db.supplementAdvisorRuns.bulkDelete(existingToday)

  const run: SupplementAdvisorRun = {
    id: newSupplementAdvisorRunId(),
    date: today,
    generatedAt: Date.now(),
    suggestions,
    context,
  }
  await db.supplementAdvisorRuns.add(run)
  await pruneOldRuns()
  return run
}

/**
 * The once-a-day automatic refresh, called on app start.
 *
 * Silently does nothing without an API key, and swallows failures: this runs
 * unattended in the background, so a hiccup (no network on launch, a spent
 * quota) must not surface as an error the user never asked to see. Yesterday's
 * suggestions simply stay on screen, and the next launch tries again. A real
 * error only ever reaches the UI from an explicit, user-initiated retry.
 */
export async function refreshAdvisorIfStale(): Promise<void> {
  if (!getApiKey()) return
  const latest = await getLatestAdvisorRun()
  if (!isRunStale(latest)) return
  try {
    await generateAdvisorRun()
  } catch {
    // Intentionally silent — see above.
  }
}
