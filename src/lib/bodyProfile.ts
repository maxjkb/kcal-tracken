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
}

export function clearBodyProfile(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export interface DailyTargets {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Mifflin-St Jeor basal metabolic rate, scaled by activity level. */
export function computeTDEE(
  profile: Pick<BodyProfile, 'sex' | 'heightCm' | 'weightKg' | 'age' | 'activityLevel'>,
): number {
  const { sex, heightCm, weightKg, age, activityLevel } = profile
  const bmr =
    sex === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel]
}

/**
 * Slider bounds for the daily deficit/surplus (goalRateKcal), as a fraction
 * of TDEE. "Recommended max" reference points (moderate, widely-cited
 * fitness guidelines) plus a 10% buffer the slider can still reach beyond
 * that reference — except "Muskelaufbau", which gets a smaller, symmetric
 * range with no extra buffer since it is not meant to be pushed hard in
 * either direction.
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
 * Macros: protein at 1.8g/kg bodyweight (2.2g/kg for "Muskelaufbau" —
 * prioritizes hitting protein needs alongside a smaller, optional
 * deficit/surplus), fat at 25% of target kcal, carbs fill the remainder.
 * This is a standard rule-of-thumb split, not personalized nutrition advice.
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

/** Percentage of a target reached, clamped to a sane display range. */
export function percentOfTarget(value: number, target: number): number | null {
  if (!target || target <= 0) return null
  return Math.round((value / target) * 100)
}
