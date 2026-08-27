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

/** The trend line is the one thing on the chart that isn't data — red keeps it from reading as another series. */
const TREND_COLOR = '#ff3b30'
const LINE_COLOR = '#1E90FF' // matches --color-kcal/--color-accent in index.css

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
  data: StatBucket[]
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
      <div className="h-56 shrink-0" ref={chartRef}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 8, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--color-ink-soft)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis stroke="var(--color-ink-soft)" fontSize={12} tickLine={false} axisLine={false} />
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
            ref={popupRef}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
            className="glass mt-3 shrink-0 overflow-hidden rounded-3xl p-4 shadow-lg shadow-black/10"
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
