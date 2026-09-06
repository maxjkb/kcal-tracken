import { MacroIcon, type MacroType } from './MacroIcon'

const BADGE_BG: Record<MacroType, string> = {
  kcal: 'bg-kcal',
  protein: 'bg-protein',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
}

// Global audit (v2.0.0): computed by actual WCAG contrast against each
// fill, not eyeballed — kcal is the one macro whose fill genuinely swaps
// brightness per theme (darker blue in light mode, lighter in dark), so it
// alone needs text that flips too (var(--color-bg), same trick as
// .glass-accent in index.css). Protein/carbs/fat stay a fixed dark ink in
// both themes (--color-badge-ink, index.css) — their fills don't invert,
// and white text on any of them measured well under the 4.5:1 minimum
// (bg-carbs+white was ~2:1 in both themes).
const BADGE_TEXT: Record<MacroType, string> = {
  kcal: 'text-bg',
  protein: 'text-badge-ink',
  carbs: 'text-badge-ink',
  fat: 'text-badge-ink',
}

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
      className={`inline-flex items-center justify-center gap-1 rounded-full font-semibold ${BADGE_BG[type]} ${BADGE_TEXT[type]} ${width} ${text} ${className}`}
    >
      <MacroIcon type={type} className={icon} />
      {Math.round(value)}
    </span>
  )
}
