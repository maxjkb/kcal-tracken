import { pushProfileChange } from './sync'
import type { Micronutrients } from './db'

const STORAGE_KEY = 'kcal-tracker:body-profile'

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Goal = 'lose' | 'maintain' | 'gain' | 'build_muscle'

export interface BodyProfile {
  sex: Sex
  heightCm: number
  weightKg: number
  age: number
  activityLevel: ActivityLevel
  goal: Goal
  /** Daily kcal deficit (goal="lose") or surplus (goal="gain"); ignored when goal="maintain". */
  goalRateKcal: number
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sitzend (kaum Bewegung)',
  light: 'Leicht aktiv (1–3x Sport/Woche)',
  moderate: 'Mäßig aktiv (3–5x Sport/Woche)',
  active: 'Aktiv (6–7x Sport/Woche)',
  very_active: 'Sehr aktiv (Sport + körperliche Arbeit)',
}

/**
 * Physical Activity Level (PAL) multipliers, converting BMR to total daily
 * energy expenditure. These five values are the standard PAL bands from the
 * FAO/WHO/UNU joint expert consultation on human energy requirements (2001,
 * "Human energy requirements", FAO Food and Nutrition Technical Report
 * Series 1) — not house numbers; every general-purpose TDEE calculator that
 * cites a source traces back to this same table.
 */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Abnehmen',
  maintain: 'Halten',
  gain: 'Zunehmen',
  build_muscle: 'Muskelaufbau',
}

export function getBodyProfile(): BodyProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as BodyProfile) : null
  } catch {
    return null
  }
}

export function setBodyProfile(profile: BodyProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  pushProfileChange(profile)
}

export function clearBodyProfile(): void {
  localStorage.removeItem(STORAGE_KEY)
  pushProfileChange(null)
}

export interface DailyTargets {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Basal metabolic rate via the Mifflin-St Jeor equation (Mifflin MD, St
 * Jeor ST, et al. "A new predictive equation for resting energy expenditure
 * in healthy individuals." Am J Clin Nutr. 1990;51(2):241-247). Chosen over
 * the older Harris-Benedict equation because it's the one the Academy of
 * Nutrition and Dietetics' own evidence analysis endorses as most accurate
 * for both non-obese and obese adults when indirect calorimetry isn't
 * available (Frankenfield D, et al. "Comparison of predictive equations for
 * resting metabolic rate in healthy nonobese and obese adults: a systematic
 * review." J Am Diet Assoc. 2005;105(5):775-789) — it predicted RMR within
 * 10% of measured values in roughly 70-82% of people, the narrowest error
 * band of the equations reviewed. Like every predictive equation it's a
 * population-level estimate, not a measurement: real error for any one
 * person can still be meaningfully larger, especially outside the
 * "healthy, non-obese, not elderly" population the equation was derived on.
 */
export function computeBmr(profile: Pick<BodyProfile, 'sex' | 'heightCm' | 'weightKg' | 'age'>): number {
  const { sex, heightCm, weightKg, age } = profile
  return sex === 'male'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161
}

/** Mifflin-St Jeor BMR, scaled by activity level (see ACTIVITY_MULTIPLIERS) to estimate total daily energy expenditure. */
export function computeTDEE(
  profile: Pick<BodyProfile, 'sex' | 'heightCm' | 'weightKg' | 'age' | 'activityLevel'>,
): number {
  return computeBmr(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel]
}

/**
 * Slider bounds for the daily deficit/surplus (goalRateKcal), as a fraction
 * of TDEE. "Recommended max" reference points, plus a 10% buffer the slider
 * can still reach beyond that reference — except "Muskelaufbau", which gets
 * a smaller, symmetric range with no extra buffer since it is not meant to
 * be pushed hard in either direction.
 *
 * The reference points themselves: a deficit of roughly 300-500 kcal/day
 * (about 15-20% of a typical adult's TDEE) is the range generally used for
 * sustainable fat loss while limiting lean-mass loss, and deficits beyond
 * ~500 kcal/day are where the risk of losing muscle alongside fat rises
 * meaningfully for anyone strength training. A surplus of roughly 10-20% of
 * TDEE (≈200-500 kcal/day) is the commonly used range for a "lean bulk" —
 * enough to support muscle gain without an outsized rate of fat gain,
 * larger for less experienced lifters, smaller for more advanced ones. 20%
 * deficit / 15% surplus sit inside those ranges for most bodyweights; the
 * slider's own buffer exists so someone deliberately choosing a slightly
 * more aggressive rate isn't hard-blocked at exactly the textbook number.
 */
const RECOMMENDED_MAX_DEFICIT_FRACTION = 0.2 // Abnehmen: 20% of TDEE
const RECOMMENDED_MAX_SURPLUS_FRACTION = 0.15 // Zunehmen: 15% of TDEE
const MUSCLE_BUILD_RANGE_FRACTION = 0.08 // Muskelaufbau: ±8% of TDEE
const SLIDER_BUFFER = 1.1 // +10% beyond the recommended reference, lose/gain only

export function computeGoalRateBounds(goal: Goal, tdee: number): { min: number; max: number } {
  if (goal === 'lose') return { min: -Math.round(tdee * RECOMMENDED_MAX_DEFICIT_FRACTION * SLIDER_BUFFER), max: 0 }
  if (goal === 'gain') return { min: 0, max: Math.round(tdee * RECOMMENDED_MAX_SURPLUS_FRACTION * SLIDER_BUFFER) }
  if (goal === 'build_muscle') {
    const range = Math.round(tdee * MUSCLE_BUILD_RANGE_FRACTION)
    return { min: -range, max: range }
  }
  return { min: 0, max: 0 }
}

/**
 * Mifflin-St Jeor TDEE, adjusted by the goal's daily deficit/surplus
 * (goalRateKcal, chosen via the in-range slider — see computeGoalRateBounds).
 *
 * Macros:
 * - Protein at 1.8g/kg bodyweight generally, 2.2g/kg for "Muskelaufbau".
 *   The International Society of Sports Nutrition's 2017 position stand
 *   (Jäger R, et al. "International Society of Sports Nutrition Position
 *   Stand: protein and exercise." J Int Soc Sports Nutr. 2017;14:20) puts
 *   1.4-2.0g/kg as sufficient for building/maintaining muscle in most
 *   exercising adults; a 2018 meta-analysis (Morton RW, et al. "A
 *   systematic review, meta-analysis and meta-regression of the effect of
 *   protein supplementation on resistance training-induced gains in
 *   muscle mass and strength in healthy adults." Br J Sports Med.
 *   2018;52(6):376-384) found intakes up to ~2.2g/kg still associated with
 *   greater lean-mass gains in resistance-trained individuals, which is
 *   the figure used here for the one goal actually built around muscle
 *   gain; 1.8g/kg for the other three goals sits inside the ISSN's general
 *   range with headroom for a cut (higher relative protein helps preserve
 *   muscle in a deficit) without over-prescribing it for someone just
 *   maintaining.
 * - Fat at 25% of target kcal — inside the Institute of Medicine's
 *   Acceptable Macronutrient Distribution Range of 20-35% of energy from
 *   fat for adults (Dietary Reference Intakes for Energy, Carbohydrate,
 *   Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids,
 *   National Academies Press, 2005), picked as a mid-range default rather
 *   than the low or high end.
 * - Carbs fill whatever energy remains after protein and fat — which lands
 *   solidly inside the IOM's 45-65%-of-energy AMDR for carbohydrate for any
 *   realistic combination of the protein/fat values above.
 *
 * This is a standard, published rule-of-thumb split, not personalized
 * nutrition advice tailored to any one person's medical situation — see
 * BodyProfileSection's own "Wie wird der Bedarf berechnet?" info sheet,
 * which shows this exact computation with its intermediate numbers.
 */
export function computeDailyTargets(profile: BodyProfile): DailyTargets {
  const { goal, goalRateKcal, weightKg } = profile

  const tdee = computeTDEE(profile)

  // "Halten" stays calorie-neutral. The other three goals apply
  // goalRateKcal directly — it's signed (negative = deficit, positive =
  // surplus) and already clamped to computeGoalRateBounds by the UI, but we
  // re-derive the sign defensively here for lose/gain so an old stored
  // profile (from before this was a bidirectional slider) still lands on
  // the right side of zero regardless of how it was saved.
  const adjustment =
    goal === 'lose'
      ? -Math.abs(goalRateKcal)
      : goal === 'gain'
        ? Math.abs(goalRateKcal)
        : goal === 'build_muscle'
          ? goalRateKcal
          : 0
  const kcalTarget = Math.max(1200, tdee + adjustment)

  const proteinPerKg = goal === 'build_muscle' ? 2.2 : 1.8
  const proteinG = proteinPerKg * weightKg
  const proteinKcal = proteinG * 4
  const fatKcal = kcalTarget * 0.25
  const fatG = fatKcal / 9
  const carbsKcal = Math.max(0, kcalTarget - proteinKcal - fatKcal)
  const carbsG = carbsKcal / 4

  return {
    kcal: Math.round(kcalTarget),
    protein: Math.round(proteinG),
    carbs: Math.round(carbsG),
    fat: Math.round(fatG),
  }
}

/** Every intermediate number computeDailyTargets works through, for the "Wie wird der Bedarf berechnet?" transparency sheet (BodyProfileSection) — the same computation, just with nothing hidden between BMR and the final targets. */
export interface DailyTargetsExplanation {
  bmr: number
  activityLevel: ActivityLevel
  activityMultiplier: number
  tdee: number
  goal: Goal
  /** Signed: negative = deficit, positive = surplus, 0 for "Halten". */
  adjustment: number
  proteinPerKg: number
  targets: DailyTargets
}

export function explainDailyTargets(profile: BodyProfile): DailyTargetsExplanation {
  const bmr = computeBmr(profile)
  const tdee = computeTDEE(profile)
  const { goal, goalRateKcal } = profile
  const adjustment =
    goal === 'lose'
      ? -Math.abs(goalRateKcal)
      : goal === 'gain'
        ? Math.abs(goalRateKcal)
        : goal === 'build_muscle'
          ? goalRateKcal
          : 0
  return {
    bmr,
    activityLevel: profile.activityLevel,
    activityMultiplier: ACTIVITY_MULTIPLIERS[profile.activityLevel],
    tdee,
    goal,
    adjustment,
    proteinPerKg: goal === 'build_muscle' ? 2.2 : 1.8,
    targets: computeDailyTargets(profile),
  }
}

export type MaintenanceBalance = 'defizit' | 'erhaltung' | 'ueberschuss'

/**
 * How far the average daily kcal may sit above/below true maintenance (TDEE)
 * and still read as "Erhaltung" rather than a strict deficit/surplus — an
 * average within a day's normal logging/estimation noise of maintenance
 * shouldn't be called out as either. 100 kcal/day is a commonly used rule of
 * thumb for that noise floor (a slice of bread, roughly).
 */
const MAINTENANCE_TOLERANCE_KCAL = 100

/**
 * Classifies an average daily kcal intake against true maintenance (TDEE) —
 * deliberately independent of the user's own goal-based target
 * (computeDailyTargets): a "Muskelaufbau" goal's target already bakes in a
 * surplus, so judging the SAME average against that target (see the
 * Statistik page's own "Bilanz" tile, Ziel−Ø) would always read as roughly
 * on-target even while the user is, physiologically, eating in a real
 * surplus relative to what their body actually burns. This answers the
 * separate, honest question "is this number of calories gaining, losing or
 * holding my weight", regardless of what the user is trying to do.
 */
export function classifyMaintenanceBalance(avgKcal: number, tdee: number): MaintenanceBalance {
  const diff = avgKcal - tdee
  if (diff > MAINTENANCE_TOLERANCE_KCAL) return 'ueberschuss'
  if (diff < -MAINTENANCE_TOLERANCE_KCAL) return 'defizit'
  return 'erhaltung'
}

/**
 * DACH reference daily intakes for the curated micronutrient set (adult,
 * general population — not pregnancy/age-adjusted). Unisex values, chosen as
 * a practical midpoint where DACH itself splits by sex (e.g. Magnesium
 * 300 f / 350 m) — deliberate scope decision: the estimate feeding these is
 * already loose, and sex-specific values everywhere would claim a precision
 * the pipeline doesn't have. Iron is the one exception, kept sex-specific
 * below: the DACH gap there is roughly 2x (menstrual loss), not a rounding
 * difference, and this app already asks for sex on every profile — folding
 * that well-evidenced case in costs nothing a general "goal-based" adjustment
 * would (see the brainstorm this shipped from: goal-adjusted micronutrient
 * needs are far less established than macro needs, so this app doesn't
 * pretend otherwise for the other nine).
 *
 * Units match MICRONUTRIENT_UNITS in db.ts (µg or mg per nutrient).
 */
const MICRONUTRIENT_REFERENCE: Micronutrients = {
  vitaminD: 20,
  vitaminB12: 4,
  folate: 300,
  vitaminC: 100,
  calcium: 1000,
  iron: 10, // overwritten per sex in computeMicronutrientTargets — this is the male/default value
  magnesium: 325,
  zinc: 9,
  potassium: 4000,
  iodine: 200,
}

const IRON_REFERENCE_BY_SEX: Record<Sex, number> = { male: 10, female: 15 }

export type MicronutrientTargets = Micronutrients

/** Daily reference intake per curated micronutrient, sex-adjusted for iron only (see MICRONUTRIENT_REFERENCE above). */
export function computeMicronutrientTargets(sex: Sex): MicronutrientTargets {
  return { ...MICRONUTRIENT_REFERENCE, iron: IRON_REFERENCE_BY_SEX[sex] }
}

export type MicronutrientBand = 'low' | 'average' | 'good' | 'surplus'

/** Below this fraction of the reference intake, the average counts as "unterrepräsentiert". */
const BAND_LOW_THRESHOLD = 0.67
/** At or above this fraction, it counts as "gut" rather than merely "durchschnittlich". */
const BAND_GOOD_THRESHOLD = 1.1
/**
 * At or above this fraction — double the reference intake, not just
 * comfortably above it — it counts as "Überschuss" rather than merely
 * "gut". This is what actually drives the "is this supplement still
 * necessary" check in lib/supplementAdvisor.ts once diet and supplements
 * are summed together (see lib/micronutrients.ts): a generous but ordinary
 * intake shouldn't read as an actionable overshoot, only a genuinely large
 * one should. Deliberately a plain multiple of the *target* rather than a
 * real safety/upper-limit (UL) reference value per nutrient — the app has
 * no such data, and a wrong absolute number would read as medical advice
 * it isn't. This is a conservative heuristic, not a safety judgement.
 */
const BAND_SURPLUS_THRESHOLD = 2.0

/** Turns an average intake into one of the four bands the UI shows — see lib/micronutrients.ts for where the average itself comes from. */
export function bandForIntake(averageIntake: number, target: number): MicronutrientBand {
  if (target <= 0) return 'average'
  const ratio = averageIntake / target
  if (ratio < BAND_LOW_THRESHOLD) return 'low'
  if (ratio >= BAND_SURPLUS_THRESHOLD) return 'surplus'
  if (ratio >= BAND_GOOD_THRESHOLD) return 'good'
  return 'average'
}
