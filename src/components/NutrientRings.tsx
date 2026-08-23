import { MacroIcon, type MacroType } from './MacroIcon'

type Nutrient = MacroType | 'kcal'

const RING_COLORS: Record<Nutrient, string> = {
  kcal: 'var(--color-kcal)',
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
}

const RING_LABELS: Record<Nutrient, string> = {
  kcal: 'Kalorien',
  protein: 'Protein',
  carbs: 'Kohlenh.',
  fat: 'Fett',
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) }
}

/** SVG arc path from startAngle to endAngle (degrees, clockwise from 12 o'clock). */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

/**
 * A single "progress donut" — one modern, Apple-style ring per nutrient
 * instead of a classic multi-category pie: the filled arc (percent of the
 * day's target) and the remaining track never touch, both ends rounded,
 * with a small gap on either side. Falls back to a flat, undifferentiated
 * ring (no fill) when there's no target to measure progress against.
 */
function Ring({ type, value, percent }: { type: Nutrient; value: number; percent: number | null }) {
  const size = 88
  const r = 34
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 8
  const gapDeg = 7

  const clamped = percent === null ? 0 : Math.max(0, Math.min(percent, 100))
  const progressSpan = percent === null ? 0 : (clamped / 100) * (360 - 2 * gapDeg)
  const progressEnd = progressSpan
  const trackStart = progressSpan > 0 ? progressEnd + gapDeg : 0
  const trackEnd = 360 - gapDeg

  const color = RING_COLORS[type]

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {percent === null ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={strokeWidth} />
          ) : (
            <>
              <path
                d={describeArc(cx, cy, r, trackStart, trackEnd)}
                fill="none"
                stroke={color}
                strokeOpacity={0.18}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
              <path
                d={describeArc(cx, cy, r, 0, progressEnd)}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" style={{ color }}>
          {type === 'kcal' ? <FlameIcon className="h-5 w-5" /> : <MacroIcon type={type} className="h-5 w-5" />}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-ink">
          {Math.round(value)}
          {type !== 'kcal' && 'g'}
        </div>
        <div className="text-[10px] text-ink-soft">
          {RING_LABELS[type]}
          {percent !== null && ` · ${percent}%`}
        </div>
      </div>
    </div>
  )
}

export function NutrientRings({
  kcal,
  protein,
  carbs,
  fat,
  targets,
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: { kcal: number; protein: number; carbs: number; fat: number } | null
}) {
  function pct(value: number, target: number | undefined): number | null {
    if (!targets || !target) return null
    return Math.round((value / target) * 100)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Ring type="kcal" value={kcal} percent={pct(kcal, targets?.kcal)} />
        <Ring type="protein" value={protein} percent={pct(protein, targets?.protein)} />
        <Ring type="carbs" value={carbs} percent={pct(carbs, targets?.carbs)} />
        <Ring type="fat" value={fat} percent={pct(fat, targets?.fat)} />
      </div>
      {!targets && (
        <p className="mt-3 text-center text-[11px] text-ink-faint">
          Lege Körperwerte in den Einstellungen fest, um hier deinen Tagesfortschritt zu sehen.
        </p>
      )}
    </div>
  )
}

function FlameIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2.5c1 3 .5 4.3-1 6c-1.7 2-2.5 3.6-2.5 5.5a5 5 0 0 0 10 0c0-1.7-.6-2.8-1.7-4c.2 1.6-.4 2.6-1.3 3c.3-2.3-.4-3.6-1.8-5c-1 1.2-1.3 2-1.1 3.2c-1-1-1.3-2.3-.6-3.7c-1.2.7-1.7 1.7-1.7 3C10 8 10.6 5 12 2.5Z" />
    </svg>
  )
}
