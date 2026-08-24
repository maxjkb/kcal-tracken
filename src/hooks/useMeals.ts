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

export async function deleteMeal(id: string): Promise<void> {
  await db.meals.delete(id)
  pushMealChange(null, id)
}

export async function saveMeal(meal: Meal): Promise<void> {
  await db.meals.put(meal)
  pushMealChange(meal, meal.id)
}
