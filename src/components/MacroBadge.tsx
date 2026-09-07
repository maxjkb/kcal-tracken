import { MacroIcon, type MacroType } from './MacroIcon'

// Round 2 (v2.2): protein/carbs/fat get their own darker badge-only fills
// (--color-badge-protein/-carbs/-fat, index.css) instead of the plain
// --color-protein/-carbs/-fat used everywhere else — explicit ask for
// "kraftvoll" pills with text that flips white-in-light/black-in-dark like
// kcal's already did, which the lighter, more-pastel general-purpose fills
// couldn't clear 4.5:1 with (see index.css's comment on the exact numbers).
const BADGE_BG: Record<MacroType, string> = {
  kcal: 'bg-kcal',
  protein: 'bg-badge-protein',
  carbs: 'bg-badge-carbs',
  fat: 'bg-badge-fat',
}

// All four now flip with theme the same way (var(--color-bg): off-white
// text in light mode, near-black in dark) — the darker badge fills above
// are what makes that clear 4.5:1 for all four, not just kcal anymore.
const BADGE_TEXT = 'text-bg'

/**
 * A solid-colored pill: icon + plain number, no unit.
 *
 * Global brainstorm round (v2.1): this used to be two different shapes —
 * an oval with a "kcal"/"g" suffix for kcal, plus a separate ring-outline
 * variant (MacroRingBadge, now retired) for protein/carbs/fat — wherever a
 * meal's or recipe's individual macros were listed. Explicit feedback:
 * one shape, no unit, and every pill the same size regardless of type or
 * how many digits its number has — a fixed width rather than one that
 * grows with content is what actually makes a row of these line up like a
 * row of coins instead of "1200 kcal" stretching past "8g" next to it.
 */
export function MacroBadge({
  type,
  value,
  size = 'md',
  className = '',
}: {
  type: MacroType
  value: number
  size?: 'sm' | 'md'
  /** Extra classes — a caller can still override the width, but every existing call site leaves it at the shared default. */
  className?: string
}) {
  const width = size === 'sm' ? 'w-11 py-0.5' : 'w-14 py-1'
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const icon = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded-full font-semibold ${BADGE_BG[type]} ${BADGE_TEXT} ${width} ${text} ${className}`}
    >
      <MacroIcon type={type} className={icon} />
      {Math.round(value)}
    </span>
  )
}
