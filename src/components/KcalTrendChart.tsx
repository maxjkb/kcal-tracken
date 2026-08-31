import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { StatBucket } from '../lib/stats'
import type { DailyTargets } from '../lib/bodyProfile'
import { NutrientRings } from './NutrientRings'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT } from '../lib/motionTokens'
import { useGlassSurfaceNode } from '../glass/glassSurfaces'

/** The trend line is the one thing on the chart that isn't data — red keeps it from reading as another series. */
const TREND_COLOR = '#ff3b30'
const LINE_COLOR = '#1E90FF' // matches --color-kcal/--color-accent in index.css
/** A third, distinct hue for the target line — never red (the average) or blue (actual intake). */
const TARGET_COLOR = '#af52de'

/** One bucket plus the kcal target that applied on its day(s) — see lib/targetHistory.ts. Undefined/null hides the target line for that point (no body profile, or a period entirely predating it). */
export type ChartBucket = StatBucket & { targetKcal?: number | null }

/**
 * Calories over the selected period as connected points, with the period's
 * average drawn across it.
 *
 * Points rather than bars: bars imply independent quantities you compare
 * side by side, while what matters over a week or a year is the *shape* —
 * whether intake is climbing, steady or erratic. A connected line says that
 * in one glance, and the average line gives it something to be measured
 * against.
 *
 * Tapping a point opens that bucket's full nutrients in the same rings used
 * everywhere else, because "what did that spike consist of" is the immediate
 * next question. Tapping anywhere outside closes it; tapping a different
 * point moves the popup, since dismissing before re-opening would make
 * comparing two days needlessly slow.
 */
export function KcalTrendChart({
  data,
  unitLabel,
  targets,
  emptyLabel,
  onSelectBucket,
}: {
  data: ChartBucket[]
  /** What one point represents ("Tag", "Woche", "Monat") — the trend line is labelled with it. */
  unitLabel: string
  targets: DailyTargets | null
  emptyLabel: string
  /** Drilling deeper from the popup (a day in the Woche view, a month in Jahr). */
  onSelectBucket?: (bucket: StatBucket) => void
}) {
  // The key, not the bucket. Deriving the bucket during render means a period
  // change that drops it simply resolves to null — no effect chasing state
  // that has already gone stale, and no cascading render to correct it.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = data.find((d) => d.key === selectedKey) ?? null
  const [showTargetHint, setShowTargetHint] = useState(false)
  const hasTargetLine = data.some((d) => d.targetKcal != null)

  // Averaged over the points actually plotted, not over days. In the Monat and
  // Jahr views a point is a whole week or month, so a per-day figure would
  // draw the line down near the axis and describe nothing on the chart. Empty
  // buckets are left out: a week you logged nothing in should not drag the
  // trend down as though you had eaten nothing.
  const withData = data.filter((d) => d.kcal > 0)
  const average = withData.length > 0 ? withData.reduce((sum, d) => sum + d.kcal, 0) / withData.length : 0

  /** Same point again closes it — the obvious way back out once one is open. */
  function toggleSelected(key: string) {
    setSelectedKey((current) => (current === key ? null : key))
  }
  const prefersReducedMotion = useReducedMotion()
  const chartRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // The popup mounts/unmounts with `selected` (AnimatePresence), later than
  // this component itself — useGlassSurfaceNode (not useGlassSurface) exists
  // for exactly that: it re-registers whenever the node itself changes,
  // rather than once when KcalTrendChart mounts and the popup doesn't exist yet.
  const [popupNode, setPopupNode] = useState<HTMLDivElement | null>(null)
  useGlassSurfaceNode(popupNode, 22)

  // Close on any tap that isn't on the chart or the popup itself. The chart is
  // excluded so that tapping a second point is handled by the chart's own
  // click — which moves the popup rather than closing and reopening it.
  useEffect(() => {
    if (!selected) return
    function onDocumentPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (chartRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setSelectedKey(null)
    }
    document.addEventListener('pointerdown', onDocumentPointerDown)
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown)
  }, [selected])

  if (data.length === 0) {
    return <p className="flex h-56 items-center justify-center text-sm text-ink-soft">{emptyLabel}</p>
  }

  return (
    <div className="flex h-full flex-col">
      {hasTargetLine && (
        <div className="mb-1.5 flex items-center gap-1.5 self-end">
          <span className="h-0 w-4 border-t border-solid" style={{ borderColor: TARGET_COLOR }} aria-hidden="true" />
          <span className="text-[11px] font-medium" style={{ color: TARGET_COLOR }}>
            Ziel
          </span>
          <button
            type="button"
            onClick={() => setShowTargetHint((v) => !v)}
            aria-expanded={showTargetHint}
            aria-label="Erklärung zur Ziel-Linie"
            className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-ink-faint hover:text-ink-soft"
          >
            i
          </button>
        </div>
      )}
      {hasTargetLine && showTargetHint && (
        <p className="mb-2 -mt-1 self-end text-right text-[11px] leading-snug text-ink-soft">
          Zeigt dein Tagesziel zum jeweiligen Zeitpunkt. Änderst du dein Ziel, gilt der neue Wert nur für neue Tage —
          bereits vergangene Tage behalten ihren damaligen Wert.
        </p>
      )}
      <div className="h-56 shrink-0" ref={chartRef}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          // right: 8 used to be enough when the target line carried no label
          // of its own — now its exact value is drawn as text past its last
          // point (see TargetEndLabel below), which needs real room to its
          // right or it'd be clipped by the chart's own SVG bounds.
          margin={{ top: 12, right: 124, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--color-ink-soft)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis stroke="var(--color-ink-soft)" fontSize={12} tickLine={false} axisLine={false} />
          {hasTargetLine && (
            <Line
              type="monotone"
              dataKey="targetKcal"
              stroke={TARGET_COLOR}
              strokeWidth={1.25}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={!prefersReducedMotion}
              label={(props: TargetLabelProps) => (
                <TargetEndLabel {...props} lastIndex={data.length - 1} unitLabel={unitLabel} />
              )}
            />
          )}
          {average > 0 && (
            <ReferenceLine y={average} stroke={TREND_COLOR} strokeDasharray="5 4" strokeWidth={1.5}>
              {/* An explicit <Label> child rather than the `label` prop: in
                  Recharts 3 the prop form rendered nothing at all here, and a
                  trend line without its value is just a stray red rule. */}
              <Label
                value={`Ø ${Math.round(average).toLocaleString('de-DE')} / ${unitLabel}`}
                position="insideTopRight"
                fill={TREND_COLOR}
                fontSize={11}
                fontWeight={600}
              />
            </ReferenceLine>
          )}
          {/* Dots handle their own taps rather than going through the
              chart-level onClick: that reads `activeLabel`, which Recharts only
              computes when a <Tooltip> is mounted, so without one no click ever
              resolved to a point. Owning the dot also lets it carry a hit area
              far larger than the 3.5px it draws — a 3.5px target is not
              something anyone can hit with a thumb. */}
          <Line
            type="monotone"
            dataKey="kcal"
            stroke={LINE_COLOR}
            strokeWidth={2.5}
            dot={(props) => <TappableDot {...props} onSelect={toggleSelected} selectedKey={selectedKey} />}
            activeDot={false}
            isAnimationActive={!prefersReducedMotion}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>

      {/* Below the chart, not over it. An overlaid panel necessarily covers
          half the plot, and whichever half it covers has points in it — so
          comparing two days meant closing the panel first, every time. On a
          390px screen there is no placement that avoids that; giving the
          detail its own space does. It still appears and disappears on tap,
          which is the behaviour that was actually asked for. */}
      <AnimatePresence initial={false}>
        {selected && (
          <motion.div
            ref={(el: HTMLDivElement | null) => {
              // Two independent consumers of one node — outside-click
              // detection (existing, a plain ref) and glass-surface
              // registration (new, state so useGlassSurfaceNode's effect
              // re-runs on mount/unmount) — merged by hand rather than a
              // library, since it's exactly one call site.
              popupRef.current = el
              setPopupNode(el)
            }}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
            className="gl-surface glass mt-3 shrink-0 overflow-hidden rounded-3xl p-4 shadow-lg shadow-black/10"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{selected.label}</span>
              <span className="text-xs text-ink-soft">{Math.round(selected.kcal).toLocaleString('de-DE')} kcal</span>
            </div>
            <NutrientRings
              kcal={selected.kcal}
              protein={selected.protein}
              carbs={selected.carbs}
              fat={selected.fat}
              targets={targets}
            />
            {onSelectBucket && (
              <button
                type="button"
                onClick={() => {
                  onSelectBucket(selected)
                  setSelectedKey(null)
                }}
                className="mt-3 w-full rounded-2xl bg-accent/12 py-3 text-sm font-semibold text-accent"
              >
                Details ansehen
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * One point on the line, with a touch-sized hit area.
 *
 * The visible dot stays small so the line reads as a line, while a
 * transparent circle of TAP_RADIUS around it takes the taps. Without that the
 * only thing to aim at is 3.5px across, which on a phone means missing far
 * more often than hitting.
 */
const TAP_RADIUS = 20

/** Recharts calls a Line's `label` renderer once per plotted point with this shape (x/y come typed as `string | number` even though they're always numeric in practice) — only the fields TargetEndLabel actually reads. */
interface TargetLabelProps {
  x?: string | number
  y?: string | number
  index?: number
  value?: string | number | boolean | null
}

/**
 * The target line's exact value, written once at its own right end instead
 * of living only in the legend above the chart — recharts calls this once
 * per point, so it renders nothing until `index` is the last one actually
 * plotted. `x`/`y` are that last point's own plotted position, not a fixed
 * chart corner, so the label always sits right where the line stops,
 * whatever value it happens to end on. Text starts a few px clear of the
 * point itself (line strokes and text glyphs touching read as a rendering
 * glitch, not a label) — margin.right on the chart leaves real room for it.
 */
function TargetEndLabel({ x, y, index, value, lastIndex, unitLabel }: TargetLabelProps & { lastIndex: number; unitLabel: string }) {
  if (x === undefined || y === undefined || index !== lastIndex || value == null) return <g />
  return (
    <text x={Number(x) + 6} y={y} dy={4} fontSize={10} fontWeight={700} fill={TARGET_COLOR}>
      {Math.round(Number(value)).toLocaleString('de-DE')} kcal/{unitLabel}
    </text>
  )
}

function TappableDot({
  cx,
  cy,
  payload,
  onSelect,
  selectedKey,
}: {
  cx?: number
  cy?: number
  payload?: StatBucket
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  if (cx === undefined || cy === undefined || !payload) return <g />
  const isSelected = payload.key === selectedKey
  return (
    <g cursor="pointer" onClick={() => onSelect(payload.key)}>
      <circle cx={cx} cy={cy} r={TAP_RADIUS} fill="transparent" />
      <circle cx={cx} cy={cy} r={isSelected ? 6 : 3.5} fill={LINE_COLOR} />
      {isSelected && <circle cx={cx} cy={cy} r={10} fill={LINE_COLOR} fillOpacity={0.2} />}
    </g>
  )
}
