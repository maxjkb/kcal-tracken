/**
 * The ambient tint's source: what hour it is, not what page you're on.
 *
 * This replaces the previous per-area color scheme (Feed cyan, Rezepte teal,
 * …). That scheme spent the app's entire secondary color budget restating
 * something the tab bar already says permanently and unambiguously — which
 * of four areas you're in. This one says something nothing else in the app
 * says: roughly when you are. For an app opened several times a day, around
 * meals, that is the difference between a screenshot and something that has
 * visibly moved since breakfast.
 *
 * Four buckets, chosen by daylight rather than by meal: the meal-type
 * boundaries in lib/mealTypeGuess.ts answer "what am I probably logging",
 * which is a different question and deliberately kept separate — aligning
 * them would make the tint jump at 15:00 for a reason no one can see.
 */
export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night'

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morgen',
  midday: 'Mittag',
  evening: 'Abend',
  night: 'Nacht',
}

export function timeOfDayFor(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'midday'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

/** The two custom properties each tone feeds — see the block in index.css for what consumes them. */
export const TIME_OF_DAY_VARS: Record<TimeOfDay, { tint: string; icon: string }> = {
  morning: { tint: 'var(--color-hour-morning)', icon: 'var(--color-hour-morning-icon)' },
  midday: { tint: 'var(--color-hour-midday)', icon: 'var(--color-hour-midday-icon)' },
  evening: { tint: 'var(--color-hour-evening)', icon: 'var(--color-hour-evening-icon)' },
  night: { tint: 'var(--color-hour-night)', icon: 'var(--color-hour-night-icon)' },
}
