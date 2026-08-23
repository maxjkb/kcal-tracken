import Dexie, { type EntityTable } from 'dexie'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Nutrition {
  kcal: number
  protein: number // g
  carbs: number // g
  fat: number // g
}

export interface Meal {
  id: string
  /** ISO date string, e.g. "2026-08-23" — the day this meal belongs to (local time). */
  date: string
  mealType: MealType
  title: string
  /** The raw text the user typed/dictated describing the meal. */
  description: string
  /** Optional photo, stored as a data URL (base64) directly in IndexedDB. */
  photo?: string
  nutrition: Nutrition
  /** Whether nutrition values were ever manually edited by the user. */
  manuallyEdited: boolean
  createdAt: number
  updatedAt: number
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snack',
}

export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

class KcalDatabase extends Dexie {
  meals!: EntityTable<Meal, 'id'>

  constructor() {
    super('kcal-tracker')
    this.version(1).stores({
      meals: 'id, date, mealType, createdAt',
    })
  }
}

export const db = new KcalDatabase()

export function newMealId(): string {
  return crypto.randomUUID()
}

/** Local ISO date (YYYY-MM-DD) without timezone shifting, unlike toISOString(). */
export function toLocalDateKey(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
