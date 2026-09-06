import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { monotonePath, niceTicks, visibleLabelIndices } from '../lib/chartGeometry'
import type { StatBucket } from '../lib/stats'
import type { DailyTargets } from '../lib/bodyProfile'
import { RemainingHero } from './RemainingHero'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT } from '../lib/motionTokens'
import { useGlassSurfaceNode } from '../glass/glassSurfaces'

// Exported so ChartLegendSheet's color key uses the exact same values as
// the chart itself, rather than a second set of hardcoded hexes that could
// drift out of sync with these.
/** The trend line is the one thing on the chart that isn't data — red keeps it from reading as another series. */
export const TREND_COLOR = '#ff3b30'
export const LINE_COLOR = '#2f6bff' // matches --color-kcal (light) in index.css — kcal is the one place blue survives the v2.0.0 rebrand
/** A third, distinct hue for the target line — never red (the average) or blue (actual intake). */
export const TARGET_COLOR = '#af52de'

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
  targets,
  emptyLabel,
  onSelectBucket,
}: {
  data: ChartBucket[]
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
      {/* No more inline "Ziel" legend chip here — the color key and its
          explanation moved into a Sheet (ChartLegendSheet, opened from the
          "i" StatsPage puts next to this card's own heading, level with it
          per explicit request) so the chart itself only ever shows the
          plot and its bare numbers, nothing else competing for the space a
          full-width chart needs. */}
      <div className="h-56 shrink-0" ref={chartRef}>
        <TrendPlot
          data={data}
          average={average}
          hasTargetLine={hasTargetLine}
          selectedKey={selectedKey}
          onSelect={toggleSelected}
        />
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
            <RemainingHero
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

/** Touch target around each point. The dot itself is 3.5px; nobody can hit 3.5px with a thumb. */
const TAP_RADIUS = 20
/** Room above the plot so the topmost point and the average's label aren't clipped by the frame. */
const PAD_TOP = 14
/** Room at the right for the target line's end value. */
const PAD_RIGHT = 44
/** Room below for the date labels. */
const PAD_BOTTOM = 22
/**
 * The left gutter is measured from the labels, not fixed.
 *
 * A constant was tried and clipped the Jahr view: monthly totals run to six
 * digits ("80.000"), and a gutter sized for a four-digit day ate the leading
 * ones — the axis read "0.000" three times over. ~6.8px per character at
 * 12px in the system sans, plus the 6px gap to the plot and a little slack.
 */
function leftPadding(ticks: number[]): number {
  const widest = Math.max(...ticks.map((t) => t.toLocaleString('de-DE').length))
  return Math.ceil(widest * 6.8) + 10
}
/**
 * How much room one x-axis label needs, from the widest one actually drawn.
 *
 * A single constant could only be right for one view. Sized for the Monat
 * view's "KW36" it thinned the Woche view's two-digit day numbers to every
 * other day for no reason; sized for those it would have overlapped the
 * calendar weeks. ~6.3px per character at 11px, plus a gap so neighbours
 * don't touch.
 */
function xLabelWidth(labels: string[]): number {
  const widest = Math.max(1, ...labels.map((l) => l.length))
  return widest * 6.3 + 12
}

/**
 * The plot itself — grid, axes, the two lines and the tappable points.
 *
 * Hand-drawn SVG rather than recharts, and the reason is measured, not
 * aesthetic. Mounting Statistik with the recharts chart produced one 316ms
 * block of uninterrupted JavaScript on a 4x-throttled CPU with 120 days of
 * meals; the identical page with the chart swapped for an empty box of the
 * same height came in at 77ms, and the worst frame fell from 317ms to 100ms.
 * That block is recharts' own component tree and layout pass, not the
 * drawing — this chart plots seven points in the Woche view and about five
 * in Monat, which is far too little data to be worth a general-purpose
 * charting library's fixed cost. Everything it gave us that we actually use
 * is either a dozen lines of arithmetic (lib/chartGeometry.ts) or a `<path>`.
 *
 * Deferring the mount was tried first and measured as no improvement — the
 * block already fell after the navigation, so moving it later changed
 * nothing. Removing the work was the only thing that could help.
 */
function TrendPlot({
  data,
  average,
  hasTargetLine,
  selectedKey,
  onSelect,
}: {
  data: ChartBucket[]
  average: number
  hasTargetLine: boolean
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  // The one measurement the plot needs. useLayoutEffect so the first painted
  // frame already has the real width — measuring in useEffect would show a
  // chart at the fallback width for one frame and then jump.
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      setSize((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geometry = useMemo(() => {
    if (!size || size.w < 2 || size.h < 2) return null
    const { w, h } = size
    // Right gutter holds the target line's end label; left holds the y-axis
    // numbers; bottom holds the date labels.
    // The scale has to cover every drawn thing, not just the points' own
    // values: a target or an average above the highest logged day would
    // otherwise be drawn off the top of the chart.
    const targets = data.map((d) => d.targetKcal ?? 0)
    const dataMax = Math.max(0, ...data.map((d) => d.kcal), ...targets, average)
    const { ticks, top } = niceTicks(dataMax)

    // Ticks first, because how wide the numbers are decides the left gutter.
    const plot = { top: PAD_TOP, right: w - PAD_RIGHT, bottom: h - PAD_BOTTOM, left: leftPadding(ticks) }
    const plotW = plot.right - plot.left
    const plotH = plot.bottom - plot.top
    if (plotW <= 0 || plotH <= 0) return null

    const x = (i: number) => (data.length === 1 ? plot.left + plotW / 2 : plot.left + (plotW * i) / (data.length - 1))
    const y = (v: number) => plot.bottom - (plotH * v) / (top || 1)

    const kcalPoints = data.map((d, i) => ({ x: x(i), y: y(d.kcal) }))
    // Points without a target are skipped rather than plotted at zero —
    // recharts' `connectNulls`, which is what a gap in the target history
    // (a period predating the body profile) has to mean.
    const targetPoints = data
      .map((d, i) => (d.targetKcal == null ? null : { x: x(i), y: y(d.targetKcal), value: d.targetKcal }))
      .filter((p): p is { x: number; y: number; value: number } => p !== null)

    return {
      plot,
      ticks,
      kcalPath: monotonePath(kcalPoints),
      kcalPoints,
      targetPath: monotonePath(targetPoints),
      targetEnd: targetPoints[targetPoints.length - 1] ?? null,
      averageY: average > 0 ? y(average) : null,
      labelIndices: visibleLabelIndices(data.length, plotW, xLabelWidth(data.map((d) => d.label))),
      x,
    }
  }, [size, data, average])

  return (
    <div ref={hostRef} className="h-full w-full">
      {geometry && size && (
        <svg width={size.w} height={size.h} role="presentation">
          {/* Horizontal rules only. Vertical ones would fence each point into
              its own cell, which is how you read a bar chart — this is a line,
              and the eye should follow it across. */}
          {geometry.ticks.map((t, i) => {
            const yy = geometry.plot.bottom - ((geometry.plot.bottom - geometry.plot.top) * t) / (geometry.ticks[geometry.ticks.length - 1] || 1)
            return (
              <g key={t}>
                <line
                  x1={geometry.plot.left}
                  x2={geometry.plot.right}
                  y1={yy}
                  y2={yy}
                  stroke="var(--color-line)"
                  strokeDasharray="3 3"
                />
                <text
                  x={geometry.plot.left - 6}
                  y={yy}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fill="var(--color-ink-soft)"
                >
                  {i === 0 ? '0' : t.toLocaleString('de-DE')}
                </text>
              </g>
            )
          })}

          {geometry.labelIndices.map((i) => (
            <text
              key={data[i].key}
              x={geometry.x(i)}
              y={geometry.plot.bottom + 16}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill="var(--color-ink-soft)"
            >
              {data[i].label}
            </text>
          ))}

          {hasTargetLine && geometry.targetPath && (
            <>
              <path d={geometry.targetPath} fill="none" stroke={TARGET_COLOR} strokeWidth={1.25} />
              {geometry.targetEnd && (
                <text
                  x={geometry.targetEnd.x + 6}
                  y={geometry.targetEnd.y}
                  dy={4}
                  fontSize={10}
                  fontWeight={700}
                  fill={TARGET_COLOR}
                >
                  {Math.round(geometry.targetEnd.value).toLocaleString('de-DE')}
                </text>
              )}
            </>
          )}

          {geometry.averageY !== null && (
            <>
              <line
                x1={geometry.plot.left}
                x2={geometry.plot.right}
                y1={geometry.averageY}
                y2={geometry.averageY}
                stroke={TREND_COLOR}
                strokeDasharray="5 4"
                strokeWidth={1.5}
              />
              <text
                x={geometry.plot.right - 2}
                y={geometry.averageY - 5}
                textAnchor="end"
                fontSize={11}
                fontWeight={600}
                fill={TREND_COLOR}
              >
                {Math.round(average).toLocaleString('de-DE')}
              </text>
            </>
          )}

          <path
            d={geometry.kcalPath}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* The visible dot stays small so the line reads as a line, while a
              transparent circle of TAP_RADIUS around it takes the taps.
              Without that the only thing to aim at is 3.5px across, which on
              a phone means missing far more often than hitting. */}
          {geometry.kcalPoints.map((p, i) => {
            const isSelected = data[i].key === selectedKey
            return (
              <g key={data[i].key} cursor="pointer" onClick={() => onSelect(data[i].key)}>
                <circle cx={p.x} cy={p.y} r={TAP_RADIUS} fill="transparent" />
                {isSelected && <circle cx={p.x} cy={p.y} r={10} fill={LINE_COLOR} fillOpacity={0.2} />}
                <circle cx={p.x} cy={p.y} r={isSelected ? 6 : 3.5} fill={LINE_COLOR} />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
