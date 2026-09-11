import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toLocalDateKey } from '../lib/db'
import { formatPeriodLabel, getPeriodRange, monthHeadingLabel, type Period, type StatBucket } from '../lib/stats'
import { useSickDayBuckets } from '../lib/illness'
import { DayPickerModal, MonthPickerModal, YearPickerModal } from './DatePickerModal'
import { GlassSurface } from '../glass/GlassSurface'
import { PeriodToggle } from './PeriodToggle'
import { ThermometerIcon } from './SickDayButton'
import { niceTicks, visibleLabelIndices } from '../lib/chartGeometry'

/** Same rust-red as --color-warning — sick days already read as "the red one" via the calendar's red digit (DatePickerModal) and the Feed button's filled-red state; this chart keeps that same association rather than introducing a fourth red. */
const BAR_COLOR = 'var(--color-warning)'

const PAD_TOP = 14
const PAD_BOTTOM = 22
const BAR_GAP_RATIO = 0.35

function leftPadding(ticks: number[]): number {
  const widest = Math.max(...ticks.map((t) => t.toLocaleString('de-DE').length))
  return Math.ceil(widest * 6.8) + 10
}

function xLabelWidth(labels: string[]): number {
  const widest = Math.max(1, ...labels.map((l) => l.length))
  return widest * 6.3 + 12
}

/**
 * Krankheits-Diagramm — how many days were marked sick per bucket (Woche:
 * per day, 0 or 1; Monat: per week; Jahr: per month). Bars rather than a
 * line, unlike the other Statistik trend charts: a count of discrete days
 * is a quantity you compare bucket-to-bucket, not a continuous value whose
 * *shape* over time is the point (see KcalTrendChart's own doc comment on
 * why it chose a line for exactly the opposite reason).
 *
 * Same self-contained Woche/Monat/Jahr toggle as MacroTrendCard, and the
 * same drill-down convention (a bar opens that day/week/month one level
 * deeper), so this reads as one family with the rest of the feed despite
 * the different chart shape.
 */
export function IllnessChart() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('week')
  const [anchorKey, setAnchorKey] = useState(() => toLocalDateKey(new Date()))
  const [pickerOpen, setPickerOpen] = useState(false)

  const { startKey, endKey } = getPeriodRange(period, anchorKey)
  const buckets = useSickDayBuckets(startKey, endKey, period)

  function handleBarClick(bucket: StatBucket) {
    if (period === 'week') navigate('/', { state: { dateKey: bucket.key } })
    else if (period === 'month') {
      setPeriod('week')
      setAnchorKey(bucket.key)
    } else {
      setPeriod('month')
      setAnchorKey(`${bucket.key}-01`)
    }
  }

  const total = buckets?.reduce((sum, b) => sum + b.kcal, 0) ?? 0

  return (
    <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-4 shadow-sm shadow-black/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span style={{ color: BAR_COLOR }}>
            <ThermometerIcon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-ink-soft">Krankheit</span>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle value={period} onChange={setPeriod} />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-[11px] font-medium text-ink-soft underline decoration-dotted underline-offset-2"
          >
            {period === 'year' ? anchorKey.slice(0, 4) : formatPeriodLabel(period, anchorKey)}
          </button>
        </div>
      </div>
      {(period === 'week' || period === 'month') && buckets !== undefined && buckets.length > 0 && (
        <p className="mb-1 text-[11px] font-medium text-ink-faint">{monthHeadingLabel(startKey, endKey)}</p>
      )}
      <p className="mb-1 text-xs text-ink-soft">
        <span className="hero-num text-base text-ink">{total}</span> {total === 1 ? 'kranker Tag' : 'kranke Tage'} in diesem Zeitraum
      </p>
      <div className="h-40">
        {buckets === undefined ? (
          <p className="flex h-full items-center justify-center text-sm text-ink-soft">Lädt…</p>
        ) : (
          <IllnessBarPlot data={buckets} onSelect={handleBarClick} />
        )}
      </div>

      {pickerOpen && period === 'week' && (
        <DayPickerModal selectedDateKey={anchorKey} onSelect={(key) => { setAnchorKey(key); setPickerOpen(false) }} onClose={() => setPickerOpen(false)} />
      )}
      {pickerOpen && period === 'month' && (
        <MonthPickerModal
          selectedYear={Number(anchorKey.slice(0, 4))}
          selectedMonth={Number(anchorKey.slice(5, 7))}
          onSelect={(year, month) => { setAnchorKey(`${year}-${String(month).padStart(2, '0')}-01`); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {pickerOpen && period === 'year' && (
        <YearPickerModal
          selectedYear={Number(anchorKey.slice(0, 4))}
          onSelect={(year) => { setAnchorKey(`${year}-01-01`); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </GlassSurface>
  )
}

function IllnessBarPlot({ data, onSelect }: { data: StatBucket[]; onSelect: (bucket: StatBucket) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

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
    const dataMax = Math.max(1, ...data.map((d) => d.kcal))
    const { ticks, top } = niceTicks(dataMax)
    const plot = { top: PAD_TOP, right: w, bottom: h - PAD_BOTTOM, left: leftPadding(ticks) }
    const plotW = plot.right - plot.left
    const plotH = plot.bottom - plot.top
    if (plotW <= 0 || plotH <= 0) return null

    const step = plotW / data.length
    const barWidth = step * (1 - BAR_GAP_RATIO)
    const y = (v: number) => plot.bottom - (plotH * v) / (top || 1)
    const bars = data.map((d, i) => ({
      x: plot.left + step * i + (step - barWidth) / 2,
      y: y(d.kcal),
      width: barWidth,
      height: plot.bottom - y(d.kcal),
    }))

    return { plot, ticks, top, bars, labelIndices: visibleLabelIndices(data.length, plotW, xLabelWidth(data.map((d) => d.label))) }
  }, [size, data])

  if (data.length === 0) {
    return <p className="flex h-full items-center justify-center text-sm text-ink-soft">Keine Einträge in diesem Zeitraum.</p>
  }

  return (
    <div ref={hostRef} className="h-full w-full">
      {geometry && size && (
        <svg width={size.w} height={size.h} role="presentation">
          {geometry.ticks.map((t, i) => {
            const yy = geometry.plot.bottom - ((geometry.plot.bottom - geometry.plot.top) * t) / (geometry.top || 1)
            return (
              <g key={t}>
                <line x1={geometry.plot.left} x2={size.w} y1={yy} y2={yy} stroke="var(--color-line)" strokeDasharray="3 3" />
                <text x={geometry.plot.left - 6} y={yy} dy={4} textAnchor="end" fontSize={12} fill="var(--color-ink-soft)">
                  {i === 0 ? '0' : t.toLocaleString('de-DE')}
                </text>
              </g>
            )
          })}
          {geometry.labelIndices.map((i) => (
            <text
              key={data[i].key}
              x={geometry.bars[i].x + geometry.bars[i].width / 2}
              y={geometry.plot.bottom + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-ink-soft)"
            >
              {data[i].label}
            </text>
          ))}
          {geometry.bars.map((b, i) => (
            <rect
              key={data[i].key}
              x={b.x}
              y={b.y}
              width={b.width}
              height={Math.max(0, b.height)}
              rx={Math.min(4, b.width / 2)}
              fill={data[i].kcal > 0 ? BAR_COLOR : 'var(--color-line)'}
              cursor="pointer"
              onClick={() => onSelect(data[i])}
            />
          ))}
        </svg>
      )}
    </div>
  )
}
