import { db, MICRONUTRIENT_ORDER, toLocalDateKey, type Micronutrients, type MicronutrientKey } from './db'
import { bandForIntake, computeMicronutrientTargets, type MicronutrientBand, type Sex } from './bodyProfile'
import { estimateMicronutrientsBackfill } from './gemini'
import { pushMealChange } from './sync'
import { getApiKey } from './settings'

/**
 * Trailing window the "gut/durchschnittlich/unterrepräsentiert" bands
 * average over — a week, not a single day. Matches how the DACH reference
 * values themselves are meant to be read (met across a week, not necessarily
 * on any one day) and smooths out both a single very good meal and a single
 * skipped one, either of which would otherwise flip a band on its own.
 */
export const MICRONUTRIENT_WINDOW_DAYS = 7

export interface MicronutrientStatus {
  key: MicronutrientKey
  /** Average daily intake over the days that actually carried an AI estimate — null if none in the window did. Never shown to the user directly, only via `band`. */
  average: number | null
  target: number
  /** null when there's no estimate at all to judge — the UI shows this as "keine Daten", not as a fourth color. */
  band: MicronutrientBand | null
}

export interface MicronutrientOverview {
  windowDays: number
  /** How many distinct days in the window had at least one AI-estimated meal — the honest denominator behind every average above, and worth surfacing so a two-day week doesn't read as a confident verdict. */
  daysWithEstimate: number
  statuses: MicronutrientStatus[]
}

function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return toLocalDateKey(date)
}

/**
 * The rolling micronutrient picture as of `endDateKey`, from meals that
 * carry an AI estimate — meals without one (manual entries, or logged
 * before this feature existed) are excluded from the average rather than
 * counted as zero, same reasoning as Meal.micronutrients in db.ts. A day
 * counts toward `daysWithEstimate` once it has any such meal, mirroring how
 * lib/supplementAdvisor.ts already counts "days that actually carried data"
 * for the macro average, rather than a separate denominator per nutrient.
 */
export async function computeMicronutrientOverview(endDateKey: string, sex: Sex): Promise<MicronutrientOverview> {
  const startKey = addDays(endDateKey, -(MICRONUTRIENT_WINDOW_DAYS - 1))
  const meals = await db.meals.where('date').between(startKey, endDateKey, true, true).toArray()

  const targets = computeMicronutrientTargets(sex)
  const sums = Object.fromEntries(MICRONUTRIENT_ORDER.map((key) => [key, 0])) as Micronutrients
  const daysWithEstimate = new Set<string>()

  for (const meal of meals) {
    if (!meal.micronutrients) continue
    daysWithEstimate.add(meal.date)
    for (const key of MICRONUTRIENT_ORDER) sums[key] += meal.micronutrients[key] ?? 0
  }

  const periodDays = daysWithEstimate.size
  const statuses: MicronutrientStatus[] = MICRONUTRIENT_ORDER.map((key) => {
    const target = targets[key]
    const average = periodDays > 0 ? sums[key] / periodDays : null
    return { key, average, target, band: average === null ? null : bandForIntake(average, target) }
  })

  return { windowDays: MICRONUTRIENT_WINDOW_DAYS, daysWithEstimate: periodDays, statuses }
}

/**
 * A single meal's own contribution is a different question from the rolling
 * band above — "does this dish carry real micronutrient value" rather than
 * "how am I doing this week" — so it gets its own, much simpler rule: a
 * nutrient is worth calling out on a meal if that meal alone covers at least
 * a third of the WHOLE DAY's reference intake. A third rather than, say, a
 * quarter (four meals/snacks a day): the point is spotting a meal that
 * genuinely carries a nutrient, not flagging everything that's merely above
 * a token amount.
 */
const NOTABLE_SHARE_OF_DAY = 1 / 3

/** Which of a meal's estimated micronutrients are worth calling out as a notable source — see MealDetail, which renders these as small badges. */
export function notableMicronutrients(meal: Micronutrients, sex: Sex): MicronutrientKey[] {
  const targets = computeMicronutrientTargets(sex)
  return MICRONUTRIENT_ORDER.filter((key) => meal[key] >= targets[key] * NOTABLE_SHARE_OF_DAY)
}

// --- Rückwirkende Schätzung für Mahlzeiten von vor diesem Feature ---------

/** How many meals go into one Gemini call — enough to meaningfully cut the number of calls, small enough to stay a reliable structured response. */
const BACKFILL_BATCH_SIZE = 15
/**
 * Cap per app launch. A meal history can run into the hundreds; asking for
 * all of them in one launch would spend a full day's quota on numbers
 * nobody's waiting on. What's left over simply gets picked up on the next
 * launch — `backfillMissingMicronutrients` re-queries "who's still missing
 * it" every time rather than tracking progress itself, so there's nothing to
 * get out of sync if a session closes mid-way.
 */
const BACKFILL_MAX_PER_LAUNCH = 60

/**
 * Fills in `micronutrients` for meals logged before this field existed —
 * silently, in the background, roughly (title/description only, see
 * estimateMicronutrientsBackfill in lib/gemini.ts). Without this, every
 * meal logged before the feature shipped would sit outside the rolling
 * average forever, which for an established user is most of their history.
 *
 * Best-effort like the other background refreshes in this app
 * (refreshTipsIfStale, refreshAdvisorIfStale): no API key or a failed
 * request just means it tries again next launch, never a visible error for
 * something the user never asked to see.
 */
export async function backfillMissingMicronutrients(): Promise<void> {
  if (!getApiKey()) return

  const candidates = await db.meals
    .filter((m) => !m.micronutrients)
    .limit(BACKFILL_MAX_PER_LAUNCH)
    .toArray()
  if (candidates.length === 0) return

  for (let i = 0; i < candidates.length; i += BACKFILL_BATCH_SIZE) {
    const batch = candidates.slice(i, i + BACKFILL_BATCH_SIZE)
    try {
      const results = await estimateMicronutrientsBackfill(
        batch.map((m) => ({ id: m.id, title: m.title, description: m.description })),
      )
      for (const meal of batch) {
        const micronutrients = results[meal.id]
        if (!micronutrients) continue
        const updated = { ...meal, micronutrients }
        await db.meals.put(updated)
        pushMealChange(updated, updated.id)
      }
    } catch {
      // Best-effort — this batch (and any remaining ones) simply try again
      // next launch, rather than surfacing a retry loop for a background fill.
      return
    }
  }
}
