import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealSummariesInRange } from '../hooks/useMeals'
import { toLocalDateKey, type Nutrition } from '../lib/db'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { targetKcalAsNutritionMap, targetKcalByBucketKey, useDailyTargetKcalMap } from '../lib/targetHistory'
import {
  bucketByDay,
  bucketByMonth,
  bucketByWeek,
  formatPeriodLabel,
  getPeriodRange,
  monthHeadingLabel,
  type Period,
  type StatBucket,
} from '../lib/stats'
import { DayPickerModal, MonthPickerModal, YearPickerModal } from './DatePickerModal'
import { KcalTrendChart, type ChartBucket } from './KcalTrendChart'
import { ChartLegendSheet } from './ChartLegendSheet'
import { GlassSurface } from '../glass/GlassSurface'
import { PeriodToggle } from './PeriodToggle'
import { STATS_TILE_META } from './StatsTileMeta'
import type { StatsTileKey } from '../lib/statsLayout'

type TrendMacro = 'kcal' | 'protein' | 'carbs' | 'fat'

const METRIC_COLOR: Record<TrendMacro, string> = {
  kcal: '#2f6bff', // matches KcalTrendChart's own default — kcal's identity blue
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
}

/**
 * One nutrient's trend chart, self-contained — its own Woche/Monat/Jahr
 * toggle, calendar navigation, legend and drill-down, all independent of
 * every other tile on the Statistik feed (Round 5, v2.5): the page used to
 * have exactly one of these (kcal) sharing a single page-level period
 * switcher with everything else on the page; explicit request that ALL
 * charts stand on the page at once ruled that shared switcher out, so each
 * chart now carries its own small one instead.
 *
 * "Tag" isn't one of this card's own period options — a single day has no
 * trend to plot; a specific day's numbers are still one tap away (drilling
 * into a Woche bar opens that day in the Feed).
 *
 * Reuses KcalTrendChart itself rather than a second chart implementation:
 * for `macro !== 'kcal'` the bucketed macro value is copied into the
 * bucket's own `kcal` field right before handing it to the chart (that
 * field is just "the plotted value" as far as the chart is concerned), and
 * the line takes on that macro's own identity color instead of kcal's blue.
 *
 * Target line: kcal reuses the real historical per-day snapshots
 * (targetHistory.ts). Protein/carbs/fat have no such history in this app —
 * only ever the CURRENT daily target — so their target line uses today's
 * value applied flatly across the whole shown range, bucketed the exact
 * same way as the real data for point-for-point alignment. Less accurate
 * for a body profile that changed recently, which is why the legend spells
 * that out for macros but not kcal (see legendTargetDescription below).
 */
export function MacroTrendCard({ macro }: { macro: TrendMacro }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('week')
  const [anchorKey, setAnchorKey] = useState(() => toLocalDateKey(new Date()))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  const { startKey, endKey } = getPeriodRange(period, anchorKey)
  const meals = useMealSummariesInRange(startKey, endKey)

  const nutritionByDate = useMemo(() => {
    const byDate = new Map<string, Nutrition>()
    for (const m of meals ?? []) {
      const day = byDate.get(m.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      day.kcal += m.nutrition.kcal
      day.protein += m.nutrition.protein
      day.carbs += m.nutrition.carbs
      day.fat += m.nutrition.fat
      byDate.set(m.date, day)
    }
    return byDate
  }, [meals])

  const bucketFn = period === 'week' ? bucketByDay : period === 'month' ? bucketByWeek : null
  const buckets = useMemo(() => {
    if (period === 'year') return bucketByMonth(Number(anchorKey.slice(0, 4)), nutritionByDate)
    return bucketFn ? bucketFn(startKey, endKey, nutritionByDate) : []
  }, [period, startKey, endKey, anchorKey, nutritionByDate, bucketFn])

  const bodyProfile = getBodyProfile()
  const dailyTargets = bodyProfile ? computeDailyTargets(bodyProfile) : null

  // kcal: real historical per-day targets. Others: today's flat target,
  // applied to every date in range then bucketed identically — see this
  // component's own doc comment. Called unconditionally either way (rules
  // of hooks) — its result is simply unused when macro isn't kcal.
  const kcalTargetByDate = useDailyTargetKcalMap(startKey, endKey)
  const flatTargetByDate = useMemo(() => {
    if (macro === 'kcal' || !dailyTargets) return null
    const map = new Map<string, Nutrition>()
    for (let cur = new Date(`${startKey}T00:00:00`); toLocalDateKey(cur) <= endKey; cur.setDate(cur.getDate() + 1)) {
      const day: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      day[macro] = dailyTargets[macro]
      map.set(toLocalDateKey(cur), day)
    }
    return map
  }, [macro, dailyTargets, startKey, endKey])

  const targetNutritionByDate = macro === 'kcal' ? (kcalTargetByDate ? targetKcalAsNutritionMap(kcalTargetByDate) : null) : flatTargetByDate

  const targetBuckets = useMemo(() => {
    if (!targetNutritionByDate) return []
    if (period === 'year') return bucketByMonth(Number(anchorKey.slice(0, 4)), targetNutritionByDate)
    return bucketFn ? bucketFn(startKey, endKey, targetNutritionByDate) : []
  }, [targetNutritionByDate, period, startKey, endKey, anchorKey, bucketFn])
  const targetByKey = targetNutritionByDate ? targetKcalByBucketKey(targetBuckets.map((b) => ({ ...b, kcal: b[macro] }))) : null

  const chartData: ChartBucket[] = buckets.map((b) => ({ ...b, kcal: b[macro], targetKcal: targetByKey?.get(b.key) ?? null }))

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

  const meta = STATS_TILE_META[macro as StatsTileKey]
  const Icon = meta.icon

  return (
    <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-4 shadow-sm shadow-black/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span style={{ color: METRIC_COLOR[macro] }}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-ink-soft">{meta.label}</span>
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
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            aria-label="Legende zum Diagramm"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-ink-faint hover:text-ink-soft"
          >
            i
          </button>
        </div>
      </div>
      {(period === 'week' || period === 'month') && meals !== undefined && buckets.length > 0 && (
        <p className="mb-1 text-[11px] font-medium text-ink-faint">{monthHeadingLabel(startKey, endKey)}</p>
      )}
      <div className="min-h-56">
        {meals === undefined ? (
          <p className="flex h-56 items-center justify-center text-sm text-ink-soft">Lädt…</p>
        ) : (
          <KcalTrendChart
            data={chartData}
            targets={dailyTargets}
            emptyLabel="Keine Einträge in diesem Zeitraum."
            onSelectBucket={handleBarClick}
            lineColor={METRIC_COLOR[macro]}
          />
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
      {legendOpen && (
        <ChartLegendSheet
          hasTargetLine={Boolean(targetByKey)}
          metricLabel={meta.label}
          lineColor={METRIC_COLOR[macro]}
          targetDescription={
            macro === 'kcal'
              ? undefined
              : 'Dein aktuelles Tagesziel, flach auf den ganzen Zeitraum übertragen — anders als bei Kalorien gibt es dafür noch keine historische Aufzeichnung, ein zuletzt geändertes Ziel gilt hier also auch rückwirkend.'
          }
          onClose={() => setLegendOpen(false)}
        />
      )}
    </GlassSurface>
  )
}
