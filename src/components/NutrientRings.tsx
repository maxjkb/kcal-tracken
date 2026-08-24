import { MacroIcon, type MacroType } from './MacroIcon'

type Nutrient = MacroType

const RING_COLORS: Record<Nutrient, string> = {
  kcal: 'var(--color-kcal)',
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
}

const RING_LABELS: Record<Nutrient, string> = {
  kcal: 'Kalorien',
  protein: 'Protein',
  carbs: 'Carbs',
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
 * The actual ring drawing, reused at any radius by both the single-nutrient
 * cards and the concentric "Gesamtwerte" widget:
 * - No target: a flat, undifferentiated track (nothing to measure progress against).
 * - Under 100%: a progress arc and the remaining track, both rounded, with a
 *   small gap between them — so it's obvious at a glance whether the ring has
 *   actually closed or not.
 * - 100% or over: the ring is fully closed (no gap), and any amount past
 *   100% is drawn as a second lap from the same start point, on top of the
 *   closed ring with a drop shadow — it visibly wraps over itself instead of
 *   silently capping at "full", the same way Apple's activity rings do.
 */
function RingVisual({
  cx,
  cy,
  r,
  strokeWidth,
  color,
  percent,
}: {
  cx: number
  cy: number
  r: number
  strokeWidth: number
  color: string
  percent: number | null
}) {
  const gapDeg = 7

  if (percent === null) {
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={strokeWidth} />
  }

  if (percent < 100) {
    const progressSpan = (percent / 100) * (360 - 2 * gapDeg)
    const trackStart = progressSpan > 0 ? progressSpan + gapDeg : 0
    return (
      <>
        <path
          d={describeArc(cx, cy, r, trackStart, 360 - gapDeg)}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path d={describeArc(cx, cy, r, 0, progressSpan)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      </>
    )
  }

  // 100%+: closed ring, plus an overlapping second lap (capped at one extra
  // full loop) for the part that exceeds the target.
  const overSpan = (Math.min(percent - 100, 100) / 100) * 360
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
      {overSpan > 0 && (
        <path
          d={describeArc(cx, cy, r, 0, overSpan)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.45))' }}
        />
      )}
    </>
  )
}

/** A single labeled nutrient ring — used both on the Feed summary and the Stats day view. */
function Ring({
  type,
  value,
  percent,
  perMealValue,
}: {
  type: Nutrient
  value: number
  percent: number | null
  /** When set, the label reads "<perMealValue> · Mahlzeit" instead of "<value> · <percent>%" — the ring itself still fills by percent. */
  perMealValue?: number
}) {
  const size = 88
  const r = 34
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 8
  const color = RING_COLORS[type]
  const displayValue = perMealValue ?? value

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <RingVisual cx={cx} cy={cy} r={r} strokeWidth={strokeWidth} color={color} percent={percent} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" style={{ color }}>
          <MacroIcon type={type} className="h-5 w-5" />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-ink">
          {Math.round(displayValue)}
          {type !== 'kcal' && 'g'}
        </div>
        <div className="text-[10px] text-ink-soft">
          {RING_LABELS[type]}
          {perMealValue !== undefined ? ' · Mahlzeit' : percent !== null && ` · ${percent}%`}
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
  perMeal,
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: { kcal: number; protein: number; carbs: number; fat: number } | null
  /** Show these per-meal-average values (labeled "· Mahlzeit") instead of the totals + percent — the ring fill still reflects the totals vs. targets. */
  perMeal?: { kcal: number; protein: number; carbs: number; fat: number }
}) {
  function pct(value: number, target: number | undefined): number | null {
    if (!targets || !target) return null
    return Math.round((value / target) * 100)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Ring type="kcal" value={kcal} percent={pct(kcal, targets?.kcal)} perMealValue={perMeal?.kcal} />
        <Ring type="protein" value={protein} percent={pct(protein, targets?.protein)} perMealValue={perMeal?.protein} />
        <Ring type="carbs" value={carbs} percent={pct(carbs, targets?.carbs)} perMealValue={perMeal?.carbs} />
        <Ring type="fat" value={fat} percent={pct(fat, targets?.fat)} perMealValue={perMeal?.fat} />
      </div>
      {!targets && (
        <p className="mt-3 text-center text-[11px] text-ink-faint">
          Lege Körperwerte in den Einstellungen fest, um hier deinen Tagesfortschritt zu sehen.
        </p>
      )}
    </div>
  )
}

const CONCENTRIC_ORDER: Nutrient[] = ['kcal', 'protein', 'carbs', 'fat']

/**
 * The compact "Gesamtwerte" widget — one Apple-activity-ring-style graphic
 * with all four nutrients nested (kcal outermost, fat innermost, matching
 * the order they're always listed in elsewhere in the app), each ring's
 * fill showing that nutrient's share of its daily target. Intentionally
 * unlabeled beyond the "Nährwerte" caption — the fill level (and the
 * wrap-over effect past 100%) is the whole point.
 */
export function ConcentricRings({
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
  const size = 128
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 11
  const gap = 3
  const outerR = size / 2 - strokeWidth / 2

  const values: Record<Nutrient, number> = { kcal, protein, carbs, fat }

  function pct(type: Nutrient): number | null {
    const target = targets?.[type]
    if (!targets || !target) return null
    return Math.round((values[type] / target) * 100)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {CONCENTRIC_ORDER.map((type, i) => (
          <RingVisual
            key={type}
            cx={cx}
            cy={cy}
            r={outerR - i * (strokeWidth + gap)}
            strokeWidth={strokeWidth}
            color={RING_COLORS[type]}
            percent={pct(type)}
          />
        ))}
      </svg>
      <span className="text-xs font-medium text-ink-soft">Nährwerte</span>
    </div>
  )
}
