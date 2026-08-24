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
 * cards and the concentric "Gesamtwerte" widget — modeled directly on
 * Apple's own Activity rings (per the user's reference screenshots):
 * - No target / 0%: one continuous ring in a dark, desaturated shade of the
 *   nutrient's color (its "track") — not a pale, low-opacity tint, which
 *   reads as washed-out rather than as a dim version of the same hue and
 *   looks inconsistent between light and dark backgrounds.
 * - Under 100%: a bright progress arc from 12 o'clock, the remainder in
 *   that same dark track shade — one continuous closed ring with no gap at
 *   either seam (the round line-caps abut directly), exactly like Apple's.
 * - 100% or over: the ring is fully closed in the bright color (no dark
 *   track left), and any amount past 100% is drawn as a second lap from the
 *   same start point, layered on top in a lighter tint of the same color
 *   with a drop shadow — reading as a distinct raised layer, matching how
 *   Apple's rings visibly wrap over themselves past a full lap instead of
 *   silently capping at "full".
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
  const trackColor = `color-mix(in srgb, ${color} 28%, black 72%)`

  if (percent === null) {
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
  }

  if (percent < 100) {
    const progressSpan = (percent / 100) * 360
    return (
      <>
        <path d={describeArc(cx, cy, r, progressSpan, 360)} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        {progressSpan > 0 && (
          <path d={describeArc(cx, cy, r, 0, progressSpan)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
      </>
    )
  }

  // 100%+: closed ring, plus an overlapping second lap (capped at one extra
  // full loop) for the part that exceeds the target — lighter + shadowed so
  // the overlap is unmistakable, not just implied by the closed base ring.
  const overSpan = (Math.min(percent - 100, 100) / 100) * 360
  const wrapColor = `color-mix(in srgb, ${color} 65%, white 35%)`
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
      {overSpan > 0 && (
        <path
          d={describeArc(cx, cy, r, 0, overSpan)}
          fill="none"
          stroke={wrapColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 2px 2.5px rgba(0,0,0,0.55))' }}
        />
      )}
    </>
  )
}

/**
 * A single labeled nutrient ring — used both on the Feed summary and the
 * Stats day view. Passing `perMealValue` switches it into the Stats-Tag
 * per-meal-detail style: a permanently closed ring (no fill/progress at
 * all, just the colored outline) with the icon AND the absolute number
 * shown inside it, and only the label below — this style is scoped to
 * that one view. Everywhere else the ring keeps its normal fill-based
 * progress behavior with the value shown below.
 */
function Ring({
  type,
  value,
  percent,
  perMealValue,
}: {
  type: Nutrient
  value: number
  percent: number | null
  /** When set, this is the Stats-Tag per-meal-detail ring: closed outline, icon + number inside, "· Mahlzeit" label below — the ring no longer shows fill/progress. */
  perMealValue?: number
}) {
  const size = 88
  const r = 34
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 8
  const color = RING_COLORS[type]
  const closed = perMealValue !== undefined
  const displayValue = perMealValue ?? value
  const numberText = `${Math.round(displayValue)}${type !== 'kcal' ? 'g' : ''}`

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {closed ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
          ) : (
            <RingVisual cx={cx} cy={cy} r={r} strokeWidth={strokeWidth} color={color} percent={percent} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5" style={{ color }}>
          <MacroIcon type={type} className={closed ? 'h-4 w-4' : 'h-5 w-5'} />
          {closed && <span className="text-xs font-bold text-ink">{numberText}</span>}
        </div>
      </div>
      <div className="text-center">
        {!closed && <div className="text-sm font-bold text-ink">{numberText}</div>}
        <div className="text-[10px] text-ink-soft">
          {RING_LABELS[type]}
          {closed ? ' · Mahlzeit' : percent !== null && ` · ${percent}%`}
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
 * The "Gesamtwerte" widget — one Apple-activity-ring-style graphic with all
 * four nutrients nested (kcal outermost, fat innermost, matching the order
 * they're always listed in elsewhere in the app), each ring's fill showing
 * that nutrient's share of its daily target — the app's signature visual,
 * reused everywhere a nutrient overview is shown. `size="compact"` renders
 * it small enough to sit inside a stat tile (Stats page's 3-tile row, every
 * period); the default size is used standalone. No caption of its own —
 * callers that want a label render it alongside.
 */
export function ConcentricRings({
  kcal,
  protein,
  carbs,
  fat,
  targets,
  size = 'default',
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: { kcal: number; protein: number; carbs: number; fat: number } | null
  size?: 'default' | 'compact'
}) {
  const dims = size === 'compact' ? { box: 60, strokeWidth: 5.5, gap: 1.5 } : { box: 128, strokeWidth: 11, gap: 3 }
  const cx = dims.box / 2
  const cy = dims.box / 2
  const outerR = dims.box / 2 - dims.strokeWidth / 2

  const values: Record<Nutrient, number> = { kcal, protein, carbs, fat }

  function pct(type: Nutrient): number | null {
    const target = targets?.[type]
    if (!targets || !target) return null
    return Math.round((values[type] / target) * 100)
  }

  return (
    <svg width={dims.box} height={dims.box} viewBox={`0 0 ${dims.box} ${dims.box}`}>
      {CONCENTRIC_ORDER.map((type, i) => (
        <RingVisual
          key={type}
          cx={cx}
          cy={cy}
          r={outerR - i * (dims.strokeWidth + dims.gap)}
          strokeWidth={dims.strokeWidth}
          color={RING_COLORS[type]}
          percent={pct(type)}
        />
      ))}
    </svg>
  )
}
