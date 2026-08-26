import type { Ingredient, Meal, MealType, Nutrition } from './db'

/** How far back the history is read. Long enough for a weekly rhythm to show, short enough that food you've moved on from drops out. */
export const SUGGESTION_HISTORY_DAYS = 90
/** Meals logged at this meal type count double — what you eat for breakfast is the strongest single signal at breakfast. */
const SAME_TYPE_WEIGHT = 2
/** Overall frequency still counts, just less than time-of-day fit. */
const FREQUENCY_WEIGHT = 0.6
/** Weight of the recency term at its peak (logged today). */
const RECENCY_WEIGHT = 3
/** Days over which the recency bonus decays to ~37% — about a fortnight. */
const RECENCY_HALFLIFE_DAYS = 14

export interface MealSuggestion {
  /** Stable key and display label — the meal's title, normalized for grouping. */
  title: string
  nutrition: Nutrition
  ingredients?: Ingredient[]
  /**
   * The free-text description behind the newest logged instance, so picking
   * a suggestion to *edit* has something to start from. Falls back to a
   * comma list built from the ingredients when the meal was logged without
   * one (e.g. picked from a recipe) — still better than an empty field.
   */
  description: string
  /** The meal type this was most often logged as, used to preselect it. */
  mealType: MealType
  /** How many times this meal has been logged in the window. */
  count: number
  lastUsedAt: number
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

function describeIngredients(ingredients: Ingredient[] | undefined): string {
  if (!ingredients || ingredients.length === 0) return ''
  return ingredients.map((ing) => `${ing.amount}${ing.unit} ${ing.name}`).join(', ')
}

/**
 * Ranks the meals worth offering as one-tap starting points at this moment.
 *
 * Three signals, in the order the user described them: what gets logged *at
 * this time* (the meal type currently being added), what gets logged often in
 * general, and what was logged recently. Combining them rather than picking
 * one is what keeps the list useful in both directions — a weekday breakfast
 * you have every day stays at the top, and something you started eating last
 * week can still break in without needing weeks of history first.
 *
 * Grouped by normalized title, keeping the most recent version's nutrition and
 * ingredients: portions get corrected over time, and the newest entry is the
 * one that reflects how you actually eat it now.
 */
export function rankMealSuggestions(meals: Meal[], forType: MealType, limit: number, now = Date.now()): MealSuggestion[] {
  const groups = new Map<string, { meals: Meal[]; sameType: number }>()

  for (const meal of meals) {
    const key = normalizeTitle(meal.title)
    if (!key || key === 'mahlzeit') continue // the fallback title carries no information
    const group = groups.get(key) ?? { meals: [], sameType: 0 }
    group.meals.push(meal)
    if (meal.mealType === forType) group.sameType += 1
    groups.set(key, group)
  }

  const scored = [...groups.values()].map((group) => {
    // Newest first, so "the current version of this meal" is index 0.
    const sorted = [...group.meals].sort((a, b) => b.updatedAt - a.updatedAt)
    const newest = sorted[0]
    const lastUsedAt = newest.updatedAt
    const ageDays = Math.max(0, (now - lastUsedAt) / 86_400_000)
    const recency = RECENCY_WEIGHT * Math.exp(-ageDays / RECENCY_HALFLIFE_DAYS)

    // Which meal type this is *usually* logged as, not just the newest one's.
    const typeCounts = new Map<MealType, number>()
    for (const m of group.meals) typeCounts.set(m.mealType, (typeCounts.get(m.mealType) ?? 0) + 1)
    const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]

    return {
      suggestion: {
        title: newest.title,
        nutrition: newest.nutrition,
        ingredients: newest.ingredients,
        description: newest.description.trim() || describeIngredients(newest.ingredients),
        mealType: dominantType,
        count: group.meals.length,
        lastUsedAt,
      } satisfies MealSuggestion,
      score: group.sameType * SAME_TYPE_WEIGHT + group.meals.length * FREQUENCY_WEIGHT + recency,
    }
  })

  return scored
    .sort((a, b) => b.score - a.score || b.suggestion.lastUsedAt - a.suggestion.lastUsedAt)
    .slice(0, limit)
    .map((s) => s.suggestion)
}
