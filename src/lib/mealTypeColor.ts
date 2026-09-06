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
 * Global brainstorm round (v2.1): these four used to deliberately reuse
 * fat's and carbs' exact hues (lunch = fat's yellow, snack = carbs' green),
 * accepted at the time because the two color systems never rendered in the
 * same form (ring outlines vs. filled badges) so the reuse never visually
 * collided. Explicit feedback overruled that too — a color meaning two
 * things is a cost on its own, independent of whether it ever collides on
 * screen — so all four now have their own hue, tuned to sit at the same
 * muted depth as each other rather than the old vivid-system-color look
 * (index.css has the actual values + the contrast numbers behind them).
 */
export const MEAL_TYPE_COLOR: Record<MealType, string> = {
  breakfast: 'var(--color-meal-breakfast)',
  lunch: 'var(--color-meal-lunch)',
  dinner: 'var(--color-meal-dinner)',
  snack: 'var(--color-meal-snack)',
}
