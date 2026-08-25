import { useRef } from 'react'
import type { Ingredient } from '../lib/db'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Macros for one unit of an ingredient — the reference an edited amount is scaled from. */
interface PerUnit {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Rescales an ingredient's macros when its amount is edited.
 *
 * Scales from a remembered **per-unit** reference rather than from the
 * ingredient's current values. Chaining ratios off the current values loses
 * the ingredient the moment the amount passes through zero, which it does on
 * every ordinary edit: clearing the field to retype "150" as "180" sends the
 * amount to 0, which multiplies every macro by 0 — and the next keystroke
 * cannot recover them, because the ratio is then computed against an amount of
 * 0 and falls back to 1. The result was a meal that silently saved with the
 * ingredient's calories missing and no way to get them back short of
 * re-estimating.
 *
 * The reference is captured the first time an ingredient is seen with a
 * positive amount, and lives in a ref: it is derived data about an edit in
 * progress, never rendered, and must not trigger a render of its own.
 */
export function useIngredientScaling() {
  const perUnit = useRef(new Map<number, PerUnit>())

  return function scaleIngredient(ingredients: Ingredient[], index: number, newAmount: number): Ingredient[] {
    const ing = ingredients[index]
    if (!ing) return ingredients

    let basis = perUnit.current.get(index)
    if (!basis && ing.amount > 0) {
      basis = {
        kcal: ing.kcal / ing.amount,
        protein: ing.protein / ing.amount,
        carbs: ing.carbs / ing.amount,
        fat: ing.fat / ing.amount,
      }
      perUnit.current.set(index, basis)
    }

    // No reference yet and no way to derive one (the amount was already 0 when
    // this ingredient arrived): record the amount, leave the macros alone
    // rather than guessing.
    if (!basis) return ingredients.map((item, i) => (i === index ? { ...item, amount: newAmount } : item))

    const amount = Math.max(0, newAmount)
    const scaled: Ingredient = {
      ...ing,
      amount,
      kcal: round1(basis.kcal * amount),
      protein: round1(basis.protein * amount),
      carbs: round1(basis.carbs * amount),
      fat: round1(basis.fat * amount),
    }
    return ingredients.map((item, i) => (i === index ? scaled : item))
  }
}
