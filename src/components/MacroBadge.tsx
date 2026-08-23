import { MacroIcon, type MacroType } from './MacroIcon'

const BADGE_BG: Record<MacroType, string> = {
  protein: 'bg-protein/15',
  carbs: 'bg-carbs/15',
  fat: 'bg-fat/15',
}

/** A pill badge showing a macro pictogram + value (+ optional "· NN%" of daily target) — no letter abbreviations. */
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
      className={`inline-flex items-center justify-center gap-1 rounded-full font-semibold text-ink ${BADGE_BG[type]} ${padding} ${text} ${className}`}
    >
      <MacroIcon type={type} className={icon} />
      {Math.round(value)}g
      {percent != null && ` · ${percent}%`}
    </span>
  )
}
