import type { MacroType } from '../components/MacroIcon'

/**
 * The four metrics' shared vocabulary — order, color, label, unit.
 *
 * One definition rather than one per component: DayShape, DaySummary and the
 * trend chart's drill-down all draw the same four things, and when the order
 * or a color lived separately in each of them, "kcal, Protein, Carbs, Fett"
 * drifted into three slightly different lists. HIG (Charting Data):
 * "Maintain continuity among multiple charts that use the same data… use one
 * chart type and consistent colors, annotations, layouts."
 */
export const MACRO_ORDER: MacroType[] = ['kcal', 'protein', 'carbs', 'fat']

export const MACRO_COLOR_VAR: Record<MacroType, string> = {
  kcal: 'var(--color-kcal)',
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
}

export const MACRO_LABELS: Record<MacroType, string> = {
  kcal: 'Kalorien',
  protein: 'Protein',
  carbs: 'Kohlenhydrate',
  fat: 'Fett',
}

/** Formatted with its unit — kcal is unitless in running text, the macros are grams. */
export function formatMacro(metric: MacroType, value: number): string {
  return `${Math.round(value)}${metric === 'kcal' ? '' : ' g'}`
}
