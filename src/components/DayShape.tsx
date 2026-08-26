import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import type { MacroType } from './MacroIcon'
import { MACRO_COLOR_VAR, MACRO_LABELS, MACRO_ORDER } from '../lib/macros'

/**
 * The app's signature graphic: one shape for the whole day.
 *
 * ## Why this replaced four rings
 *
 * The previous summary was four concentric progress rings — Apple's Activity
 * ring, essentially unchanged. It was competent and completely anonymous,
 * and it made you read four things to learn one thing ("how did today go?").
 *
 * This is one form instead: a bloom that opens outward from a core as the
 * day fills. Four petals, one per metric, each growing from the core toward
 * a guide circle that marks 100% of its target. A balanced day is a round,
 * even bloom. A day 40 g short on protein has a visible notch in it. You get
 * the gestalt before you read a single number — which is the entire point of
 * a summary graphic, and something four separate rings can't do because
 * their lengths live on four different circles that can't be compared by eye.
 *
 * ## Reading it
 *
 * - Petal length = share of that metric's daily target. The faint guide ring
 *   is 100%; a petal reaching it is on target.
 * - Petals are clamped at the guide ring. Past 100% the tip brightens
 *   instead of growing, so an enormous overshoot on one metric can't wreck
 *   the shape's readability — the shape answers "how close", and past the
 *   target "how far past" is a question for the numbers below it.
 * - With no body profile there are no targets, so no petal can be drawn
 *   against anything: the bloom renders as the guide ring and core only,
 *   and the caller shows its own "set up your profile" hint.
 *
 * ## Teaching it
 *
 * HIG (Charting Data): "If you need to create a chart that presents data in
 * a novel way, help people learn how to interpret the chart. For example…
 * an activity tracker introduces the activity rings by animating them
 * individually." That is what `teach` does — see DayShapeIntro, which is the
 * only caller that passes it.
 */

type Metric = MacroType

/** Clockwise from 12 o'clock — lib/macros.ts holds the order, so the shape, the legend and the trend chart can't drift apart. */
const METRIC_ORDER = MACRO_ORDER
const METRIC_COLOR = MACRO_COLOR_VAR

/** Everything is authored in this square and scaled by the caller's `size`, so one geometry serves every use. */
const VIEW = 100
const CENTER = VIEW / 2
/**
 * Where a petal starts. Large enough that the headline number sits inside it
 * without crowding, small enough that the growable band (CORE_R → GUIDE_R)
 * stays wide: every petal's length difference has to be legible within that
 * band, so a fat core would compress 50% and 90% into nearly the same arc.
 */
const CORE_R = 19
/** Where a petal at 100% ends, and where the guide ring is drawn. */
const GUIDE_R = 46
/** Angular gap between petals, in degrees — what keeps four petals reading as four, not as a disc. */
const PETAL_GAP = 9

function polar(r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) }
}

/**
 * One petal: an annular wedge from CORE_R out to `progress` of the way to
 * GUIDE_R. Corners are softened by stroking the same path in the same color
 * with a round line-join rather than by constructing rounded corners
 * geometrically — the visual result is identical at these sizes and the path
 * stays simple enough to rebuild every frame during the entrance animation.
 */
function petalPath(index: number, progress: number): string {
  const span = 360 / METRIC_ORDER.length
  const from = index * span + PETAL_GAP / 2
  const to = (index + 1) * span - PETAL_GAP / 2
  const outer = CORE_R + (GUIDE_R - CORE_R) * Math.max(0, Math.min(1, progress))

  // Below ~0.4% the wedge is thinner than its own softening stroke and
  // renders as a smear rather than a sliver, so it's simply not drawn.
  if (outer - CORE_R < 0.2) return ''

  const oa = polar(outer, from)
  const ob = polar(outer, to)
  const ia = polar(CORE_R, to)
  const ib = polar(CORE_R, from)
  return [
    `M ${oa.x} ${oa.y}`,
    `A ${outer} ${outer} 0 0 1 ${ob.x} ${ob.y}`,
    `L ${ia.x} ${ia.y}`,
    `A ${CORE_R} ${CORE_R} 0 0 0 ${ib.x} ${ib.y}`,
    'Z',
  ].join(' ')
}

export interface DayShapeValues {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export function DayShape({
  values,
  targets,
  size = 168,
  teach = false,
  onTeachStep,
  className = '',
}: {
  values: DayShapeValues
  targets: DayShapeValues | null
  size?: number
  /** Grow the petals one after another instead of together — the one-time introduction, see DayShapeIntro. */
  teach?: boolean
  /** Called with each metric as its petal starts growing, so the intro can label what's being drawn. */
  onTeachStep?: (metric: Metric | null) => void
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion()
  const pathRefs = useRef<(SVGPathElement | null)[]>([])
  const tipRefs = useRef<(SVGCircleElement | null)[]>([])

  const progress = METRIC_ORDER.map((metric) => {
    const target = targets?.[metric]
    if (!target) return null
    return values[metric] / target
  })

  // The petals are drawn by writing `d` straight to the DOM rather than from
  // React state: the entrance animation rebuilds four paths per frame, and
  // routing that through a re-render would make a decorative animation the
  // most expensive thing on the page. Same reason the rest of the app drives
  // its springs off MotionValues instead of state.
  const progressKey = progress.join(',')
  useEffect(() => {
    const targetProgress = progressKey.split(',').map((v) => (v === '' ? null : Number(v)))

    function draw(index: number, value: number) {
      const path = pathRefs.current[index]
      if (path) path.setAttribute('d', petalPath(index, value))
      // The tip dot marks an overshoot: at >=100% it appears at the guide
      // ring, so "on target" and "past target" are distinguishable by shape
      // and not only by a petal that stopped growing.
      const tip = tipRefs.current[index]
      if (tip) tip.setAttribute('opacity', value >= 1 ? '1' : '0')
    }

    if (prefersReducedMotion) {
      targetProgress.forEach((v, i) => draw(i, v ?? 0))
      onTeachStep?.(null)
      return
    }

    const controls = targetProgress.map((value, index) => {
      const to = value ?? 0
      if (to <= 0) {
        draw(index, 0)
        return null
      }
      // Deliberately not motion's own onPlay: that fires when the animation
      // is queued, before its `delay` has elapsed, so in teach mode all four
      // labels would appear at once. Latching on the first frame that
      // actually moves needs no assumption about how delay is scheduled.
      let announced = false
      return animate(0, to, {
        // Critically damped, no overshoot: a value readout that springs past
        // its own number and comes back reads as inaccurate, however good it
        // looks (apple-design §4 — bounce is for momentum the user supplied).
        type: 'spring',
        bounce: 0,
        duration: 0.75,
        delay: teach ? index * 0.85 : index * 0.06,
        onUpdate: (v) => {
          if (teach && !announced && v > 0) {
            announced = true
            onTeachStep?.(METRIC_ORDER[index])
          }
          draw(index, v)
        },
      })
    })

    return () => controls.forEach((c) => c?.stop())
    // onTeachStep is a callback the caller re-creates each render; including
    // it would restart the animation on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey, prefersReducedMotion, teach])

  const hasTargets = targets !== null

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      role="img"
      aria-label={
        hasTargets
          ? `Tagesübersicht: ${METRIC_ORDER.map(
              (m, i) => `${MACRO_LABELS[m]} ${Math.round((progress[i] ?? 0) * 100)} Prozent`,
            ).join(', ')}`
          : 'Tagesübersicht — noch keine Tagesziele hinterlegt'
      }
    >
      {/* The 100% mark. Drawn under the petals so a petal reaching it covers
          it, which is itself the signal that the target is met. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={GUIDE_R}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={1.5}
        strokeDasharray="1 4"
        strokeLinecap="round"
      />
      {METRIC_ORDER.map((metric, index) => (
        <g key={metric}>
          {/* The unfilled remainder of this petal's track — faint, so an
              empty petal still shows where it would grow rather than being
              indistinguishable from empty space. Deliberately fainter than
              it first shipped: at 0.10 a badly-missed target drew a large
              pale wedge that competed with the filled petals for attention,
              which is backwards — the track is context, the fill is the
              message. */}
          <path
            d={petalPath(index, 1)}
            fill={METRIC_COLOR[metric]}
            opacity={0.07}
            stroke={METRIC_COLOR[metric]}
            strokeWidth={2}
            strokeOpacity={0.07}
            strokeLinejoin="round"
          />
          <path
            ref={(el) => {
              pathRefs.current[index] = el
            }}
            d=""
            fill={METRIC_COLOR[metric]}
            stroke={METRIC_COLOR[metric]}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <circle
            ref={(el) => {
              tipRefs.current[index] = el
            }}
            {...polarAttrs(index)}
            r={2.6}
            fill="var(--color-surface)"
            stroke={METRIC_COLOR[metric]}
            strokeWidth={2}
            opacity={0}
          />
        </g>
      ))}
    </svg>
  )
}

/** The overshoot dot's position: on the guide ring, centered in its petal's span. */
function polarAttrs(index: number) {
  const span = 360 / METRIC_ORDER.length
  const mid = index * span + span / 2
  const p = polar(GUIDE_R, mid)
  return { cx: p.x, cy: p.y }
}
