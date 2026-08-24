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
 * Shifts a color toward black (amount < 0) or white (amount > 0), where
 * amount is a fraction of the way there. Deliberately a single, un-nested
 * color-mix() so it stays valid wherever color-mix is supported at all.
 */
function shade(color: string, amount: number): string {
  const pct = Math.abs(amount) * 100
  if (pct < 0.5) return color
  return `color-mix(in srgb, ${amount < 0 ? 'black' : 'white'} ${pct.toFixed(1)}%, ${color})`
}

/** Past this the ring stops wrapping — one full lap over itself is the most that still reads clearly. */
const MAX_PERCENT = 200

/** How dark the untouched track is, and the two ends of the progress gradient. */
const TRACK_SHADE = -0.74
const GRADIENT_START = -0.3
const GRADIENT_END = 0.14

/**
 * The actual ring drawing, reused at any radius by both the single-nutrient
 * cards and the concentric "Gesamtwerte" widget — modeled on Apple's own
 * Activity rings (per the user's reference screenshots):
 *
 * - 0% / no target: the *full* dark ring is still drawn, so an empty ring
 *   reads as "this would fill up" rather than disappearing. (Drawing this
 *   as an arc from 0° to 360° silently fails — both ends resolve to the
 *   same point at 12 o'clock, SVG skips the zero-length arc, and all that
 *   survives is the round line-cap: a stray dot. Hence the plain <circle>.)
 *
 * - Any progress: one continuous arc from 12 o'clock carrying an angular
 *   gradient, dark at the start and brightest at the moving tip. The arc is
 *   drawn as many short segments because SVG has no native conic gradient;
 *   each segment is a little brighter than the last and painted over it, so
 *   the round caps blend the steps into a smooth sweep.
 *
 * - Past 100%: the *same* arc simply keeps going past 360° onto a second
 *   lap. Because the gradient is continuous and later segments paint over
 *   earlier ones, the overlapping stretch is automatically brighter than
 *   the lap beneath it — so it reads as one ring wrapping over itself,
 *   not as a separate ring stacked on top. A drop shadow under the tip
 *   (stronger once it is actually overlapping something) supplies the
 *   depth cue that sells it.
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
  const trackColor = shade(color, TRACK_SHADE)

  if (percent === null || percent <= 0) {
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
  }

  const sweep = (Math.min(percent, MAX_PERCENT) / 100) * 360
  const overlapping = sweep > 360

  // The round caps are what blend the steps together, so the segment size
  // that still looks smooth depends on how far a cap reaches around this
  // particular ring — much further on the tiny inner rings of the compact
  // widget than on a big one. Sizing the step to that keeps every ring
  // smooth without emitting hundreds of needless paths on the small ones.
  const degreesPerCap = (strokeWidth / 2 / r) * (180 / Math.PI)
  const step = Math.max(3, Math.min(24, degreesPerCap * 0.85))
  const count = Math.max(2, Math.min(150, Math.ceil(sweep / step)))
  const segments = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    return {
      from: (i * sweep) / count,
      to: ((i + 1) * sweep) / count,
      stroke: shade(color, GRADIENT_START + (GRADIENT_END - GRADIENT_START) * t),
    }
  })

  // The tip is redrawn as one short arc so its shadow is a clean crescent
  // rather than the sum of a dozen overlapping per-segment shadows.
  const tipSpan = Math.min(16, sweep)

  return (
    <>
      {/* Under a full lap the untouched remainder still shows; past it the
          progress covers the whole circle anyway. */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {segments.map((seg) => (
        <path
          key={seg.from}
          d={describeArc(cx, cy, r, seg.from, seg.to)}
          fill="none"
          stroke={seg.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
      <path
        d={describeArc(cx, cy, r, sweep - tipSpan, sweep)}
        fill="none"
        stroke={shade(color, GRADIENT_END)}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={{
          filter: overlapping
            ? 'drop-shadow(0 1.5px 2.5px rgba(0,0,0,0.55))'
            : 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.3))',
        }}
      />
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

const MINI_ORDER: Nutrient[] = ['kcal', 'protein', 'carbs', 'fat']

/**
 * A compact row of permanently-closed rings (icon + absolute number, no
 * label) — used under a collapsed Feed meal-type heading (Frühstück/Mittag/
 * Abend/Snack) to show that category's totals for the day without the
 * space a full NutrientRings grid would need. Disappears again once the
 * section is expanded, since the meal cards themselves show the numbers then.
 */
export function MiniNutrientRings({
  kcal,
  protein,
  carbs,
  fat,
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
}) {
  const values: Record<Nutrient, number> = { kcal, protein, carbs, fat }
  const size = 56
  const r = 22
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 5

  return (
    <div className="flex flex-wrap gap-2">
      {MINI_ORDER.map((type) => {
        const color = RING_COLORS[type]
        const value = values[type]
        return (
          <div key={type} className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5" style={{ color }}>
              <MacroIcon type={type} className="h-3 w-3" />
              <span className="text-[10px] font-bold text-ink">
                {Math.round(value)}
                {type !== 'kcal' && 'g'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
