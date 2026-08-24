import { MacroIcon, type MacroType } from './MacroIcon'

const BADGE_BG: Record<MacroType, string> = {
  kcal: 'bg-kcal',
  protein: 'bg-protein',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
}

// Every nutrient color is dark/saturated enough for white text except fat's
// light yellow, which needs dark text to stay legible.
const BADGE_TEXT: Record<MacroType, string> = {
  kcal: 'text-white',
  protein: 'text-white',
  carbs: 'text-white',
  fat: 'text-ink',
}

/** A solid-colored pill badge showing a macro pictogram + absolute value (+ optional "· NN%" of daily target). */
export function MacroBadge({
  type,
  value,
  percent,
  size = 'md',
  className = '',
}: {
  type: MacroType
  value: number
  percent?: number | null
  size?: 'sm' | 'md'
  /** Extra classes, e.g. a fixed width so badges stacked together end up equal-sized ovals. */
  className?: string
}) {
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const icon = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded-full font-semibold ${BADGE_BG[type]} ${BADGE_TEXT[type]} ${padding} ${text} ${className}`}
    >
      <MacroIcon type={type} className={icon} />
      {Math.round(value)}
      {type === 'kcal' ? ' kcal' : 'g'}
      {percent != null && ` · ${percent}%`}
    </span>
  )
}
