import type { MealType } from './db'

/** A reasonable default meal type based on the time of day, used when adding a meal without an explicit type context. */
export function guessMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 18) return 'snack'
  return 'dinner'
}
