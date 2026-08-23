import Dexie, { type EntityTable } from 'dexie'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Nutrition {
  kcal: number
  protein: number // g
  carbs: number // g
  fat: number // g
}

export interface Ingredient {
  name: string
  /** Numeric quantity actually consumed (matches the nutrition values below), editable by the user. */
  amount: number
  /** Unit for `amount`, e.g. "g", "ml", "Stück", "EL". */
  unit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Optional AI remark about this specific ingredient (e.g. an assumption made), only when relevant. */
  note?: string
}

/**
 * A saved meal's ingredient amount used to be a single free-text string
 * (e.g. "150 g" or "1 Stück (ca. 120g)") before amount/unit were split into
 * separate editable fields. Renders old records without crashing.
 */
export function formatIngredientAmount(ing: Pick<Ingredient, 'amount' | 'unit'>): string {
  if (typeof ing.amount !== 'number') return String(ing.amount)
  return `${ing.amount} ${ing.unit ?? ''}`.trim()
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
  /** Per-ingredient breakdown from the AI estimate, if any. Read-only detail info — reflects the estimate at the time it ran, not necessarily in sync with later manual edits to `nutrition`. */
  ingredients?: Ingredient[]
  /** Optional overall AI remark about the whole meal (e.g. an assumption made), only when relevant. */
  note?: string
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
