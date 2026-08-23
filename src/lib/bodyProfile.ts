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

/**
 * Mifflin-St Jeor basal metabolic rate, scaled by activity level (TDEE), then
 * adjusted by the goal's daily deficit/surplus. Macros: protein at 1.8g/kg
 * bodyweight (2.2g/kg for "Muskelaufbau" — prioritizes hitting protein needs
 * over a calorie surplus), fat at 25% of target kcal, carbs fill the
 * remainder. This is a standard rule-of-thumb split, not personalized
 * nutrition advice.
 */
export function computeDailyTargets(profile: BodyProfile): DailyTargets {
  const { sex, heightCm, weightKg, age, activityLevel, goal, goalRateKcal } = profile

  const bmr =
    sex === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161

  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]

  // "Muskelaufbau" stays calorie-neutral (like "Halten") — no deficit or
  // surplus — and instead raises the protein target.
  const adjustment = goal === 'lose' ? -Math.abs(goalRateKcal) : goal === 'gain' ? Math.abs(goalRateKcal) : 0
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
