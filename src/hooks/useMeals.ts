import { useLiveQuery } from 'dexie-react-hooks'
import { db, toLocalDateKey, type Meal, type MealType } from '../lib/db'
import { pushMealChange } from '../lib/sync'
import { rankMealSuggestions, SUGGESTION_HISTORY_DAYS, type MealSuggestion } from '../lib/mealSuggestions'

/** All meals for a single local date key (YYYY-MM-DD), sorted by creation time. */
export function useMealsForDate(dateKey: string): Meal[] | undefined {
  return useLiveQuery(
    () => db.meals.where('date').equals(dateKey).sortBy('createdAt'),
    [dateKey],
  )
}

/** All meals between two date keys, inclusive, sorted by date then creation time. */
export function useMealsInRange(startKey: string, endKey: string): Meal[] | undefined {
  return useLiveQuery(async () => {
    const meals = await db.meals.where('date').between(startKey, endKey, true, true).toArray()
    return meals.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  }, [startKey, endKey])
}

/**
 * The most recently LOGGED meals overall (any date/category), newest first —
 * sorted by when they were entered (createdAt), not by which day they're
 * assigned to (date), since a meal's date can be moved after the fact. Used
 * by the Rezepte page's "Zuletzt" section as quick starting points for
 * turning a real, already-logged meal into a reusable recipe.
 */
export function useRecentMeals(limit: number): Meal[] | undefined {
  return useLiveQuery(() => db.meals.orderBy('createdAt').reverse().limit(limit).toArray(), [limit])
}

/**
 * One-tap starting points for the meal editor, ranked by how well each fits
 * *this* moment — see lib/mealSuggestions.ts for the scoring.
 *
 * Re-reads on every change to the meals table (useLiveQuery), so logging
 * something immediately moves it up the list the next time the editor opens.
 */
export function useMealSuggestions(forType: MealType, limit: number): MealSuggestion[] | undefined {
  return useLiveQuery(async () => {
    const startKey = toLocalDateKey(new Date(Date.now() - SUGGESTION_HISTORY_DAYS * 86_400_000))
    const meals = await db.meals.where('date').aboveOrEqual(startKey).toArray()
    return rankMealSuggestions(meals, forType, limit)
  }, [forType, limit])
}

/** The fields the statistics and the PDF export actually read — deliberately without `photo`. */
export type MealSummary = Pick<Meal, 'id' | 'date' | 'mealType' | 'nutrition' | 'createdAt'>

/**
 * Meals in a range, reduced to the fields the statistics need.
 *
 * `useMealsInRange` materialises whole records, and a Meal carries its photo
 * inline as a base64 data URL — roughly 150–300 KB each. Picking "Jahr" with a
 * year of photographed meals therefore deserialised hundreds of megabytes of
 * image data to add up twelve monthly calorie sums, which on a phone means a
 * long freeze or a crashed tab.
 *
 * Streamed with `.each()` and projected on the way past, so the photos are
 * never all held at once — Dexie has no server-side projection, but it does
 * hand records over one at a time, and each full record becomes collectable
 * again as soon as its few numbers have been copied out.
 */
export function useMealSummariesInRange(startKey: string, endKey: string): MealSummary[] | undefined {
  return useLiveQuery(async () => {
    const summaries: MealSummary[] = []
    await db.meals
      .where('date')
      .between(startKey, endKey, true, true)
      .each((m) => {
        summaries.push({ id: m.id, date: m.date, mealType: m.mealType, nutrition: m.nutrition, createdAt: m.createdAt })
      })
    return summaries.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  }, [startKey, endKey])
}

export async function deleteMeal(id: string): Promise<void> {
  await db.meals.delete(id)
  pushMealChange(null, id)
}

export async function saveMeal(meal: Meal): Promise<void> {
  await db.meals.put(meal)
  pushMealChange(meal, meal.id)
}
