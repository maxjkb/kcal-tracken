import type { MealType, SupplementTimeOfDay } from './db'

/** A reasonable default meal type based on the time of day, used when adding a meal without an explicit type context. */
export function guessMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 18) return 'snack'
  return 'dinner'
}

/**
 * Which supplement check-in slot a meal type falls into — the reverse of the
 * rough time-of-day buckets guessMealType() itself uses. Used when a meal's
 * own text mentions a supplement (see supplementTextMatch.ts): a brand-new
 * entry needs *some* default slot to be added with and checked off in, and
 * the meal it was mentioned in is the only time-of-day signal available.
 * 'night' has no meal type to map from and is left for the user to set by
 * hand in the supplement's own settings.
 */
export function mealTypeToSupplementTimeOfDay(mealType: MealType): SupplementTimeOfDay {
  if (mealType === 'breakfast') return 'morning'
  if (mealType === 'dinner') return 'evening'
  return 'noon' // lunch, snack
}
