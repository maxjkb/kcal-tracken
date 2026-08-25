import type { MealType } from './db'

/**
 * The colour each meal type carries — keyed to the time of day it names.
 *
 * These icons used to be deliberately monochrome, on the reasoning that the
 * four macro hues already mean kcal/protein/carbs/fat and a second colour
 * system would muddy the first. That was overruled: four identical grey
 * pictograms are genuinely hard to tell apart at 14px, and time of day is the
 * one attribute a glance is actually looking for here.
 *
 * The overlap that reasoning warned about is real and deliberately accepted —
 * lunch shares the fat yellow, the snack shares the carbs green. The two
 * systems never take the same form: macros are ring outlines around a macro
 * glyph, these are filled badges behind a sun or a moon. If it ever reads as
 * one meaning rather than two, lunch and snack are the values to shift.
 *
 * Indigo rather than a lilac purple for the evening: a lilac was tried for the
 * section theme and read as washed out beside this palette.
 */
export const MEAL_TYPE_COLOR: Record<MealType, string> = {
  breakfast: 'var(--color-meal-breakfast)',
  lunch: 'var(--color-meal-lunch)',
  dinner: 'var(--color-meal-dinner)',
  snack: 'var(--color-meal-snack)',
}
