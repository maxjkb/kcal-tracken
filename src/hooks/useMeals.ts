import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Meal } from '../lib/db'
import { pushMealChange } from '../lib/sync'

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

export async function deleteMeal(id: string): Promise<void> {
  await db.meals.delete(id)
  pushMealChange(null, id)
}

export async function saveMeal(meal: Meal): Promise<void> {
  await db.meals.put(meal)
  pushMealChange(meal, meal.id)
}
