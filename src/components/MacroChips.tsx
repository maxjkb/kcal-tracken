import { MacroIcon, type MacroType } from './MacroIcon'
import { formatMacro, MACRO_COLOR_VAR, MACRO_LABELS, MACRO_ORDER } from '../lib/macros'

/**
 * The four macro values as a compact row — the app's one way of listing a
 * meal's, a recipe's, an ingredient's or a collapsed day-section's numbers.
 *
 * ## What this replaced, and why
 *
 * Every call site previously composed the same quartet by hand: a solid
 * `MacroBadge` for kcal plus three `MacroRingBadge`s. Two problems came with
 * that pair.
 *
 * The rings drew a closed circle around each number while showing no
 * progress — there is no per-meal target to show progress against — so they
 * borrowed the summary graphic's language without carrying its meaning. Now
 * that the day shape is the one thing in the app that means "progress
 * toward a target", anything else circular reads as a false promise.
 *
 * The solid badge had a harder problem: it painted white or ink text
 * depending on a per-macro map hardcoded to the old palette's lightness.
 * With every macro color lightened for dark mode, white text on them lands
 * between 2.4:1 and 3.6:1 — under the 4.5:1 floor on all four. A chip whose
 * text is `ink` on a low-opacity tint of the macro color has no such
 * failure mode in either theme: the tint barely shifts the background, so
 * the number keeps the surface's own contrast, and color is carried by the
 * icon, which is a non-text element held to 3:1.
 */

const TINT: Record<'normal' | 'lead', number> = { normal: 11, lead: 18 }

function Chip({ metric, value, size, lead }: { metric: MacroType; value: number; size: 'sm' | 'md'; lead?: boolean }) {
  const color = MACRO_COLOR_VAR[metric]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full ${
        size === 'sm' ? 'py-0.5 pl-1.5 pr-2 text-[11px]' : 'py-1 pl-2 pr-2.5 text-xs'
      }`}
      style={{ background: `color-mix(in srgb, ${color} ${TINT[lead ? 'lead' : 'normal']}%, transparent)` }}
    >
      <span style={{ color }} aria-hidden="true">
        <MacroIcon type={metric} className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      </span>
      <span className={`text-ink ${lead ? 'font-semibold' : 'font-medium'}`}>
        {formatMacro(metric, value)}
        {metric === 'kcal' && ' kcal'}
      </span>
      <span className="sr-only">{MACRO_LABELS[metric]}</span>
    </span>
  )
}

export function MacroChips({
  kcal,
  protein,
  carbs,
  fat,
  size = 'md',
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  size?: 'sm' | 'md'
}) {
  const values = { kcal, protein, carbs, fat }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {MACRO_ORDER.map((metric) => (
        // kcal carries a slightly stronger tint and weight: it's the number
        // people scan for, and the row would otherwise be four equal things
        // with no entry point.
        <Chip key={metric} metric={metric} value={values[metric]} size={size} lead={metric === 'kcal'} />
      ))}
    </div>
  )
}

/** A single chip, for the few places that show only calories (the Rezepte page's "Zuletzt" rows). */
export function MacroChip({ metric, value, size = 'md' }: { metric: MacroType; value: number; size?: 'sm' | 'md' }) {
  return <Chip metric={metric} value={value} size={size} lead={metric === 'kcal'} />
}
