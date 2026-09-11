import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealSummariesInRange, type MealSummary } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, toLocalDateKey, type Nutrition } from '../lib/db'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { targetKcalAsNutritionMap, targetKcalByBucketKey, useDailyTargetKcalMap } from '../lib/targetHistory'
import { bucketByDay, bucketByMonth, bucketByMonthRange, bucketByWeek, type Period, type StatBucket } from '../lib/stats'
import { KcalTrendChart, type ChartBucket } from './KcalTrendChart'
import { ChartLegendSheet } from './ChartLegendSheet'
import { GlassSurface } from '../glass/GlassSurface'
import { STATS_TILE_META } from './StatsTileMeta'
import type { StatsTileKey } from '../lib/statsLayout'

type TrendMacro = 'kcal' | 'protein' | 'carbs' | 'fat'

const METRIC_COLOR: Record<TrendMacro, string> = {
  kcal: '#2f6bff', // matches KcalTrendChart's own default — kcal's identity blue
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
}

function bucketByPeriod(period: Period, startKey: string, endKey: string, byDate: Map<string, Nutrition>): StatBucket[] {
  if (period === 'month') return bucketByWeek(startKey, endKey, byDate)
  if (period === 'year') return bucketByMonth(Number(startKey.slice(0, 4)), byDate)
  if (period === 'all') return bucketByMonthRange(startKey, endKey, byDate)
  return bucketByDay(startKey, endKey, byDate) // 'week' (period 'day' never reaches this — see buckets below)
}

/**
 * One nutrient's trend chart. Round 6 (v2.6): the Woche/Monat/Jahr toggle
 * each of these used to carry on its own is gone — explicit request to
 * control every adaptive chart from ONE picker back on the page itself
 * (StatsPage), so this component is now purely driven by the `period`/
 * `startKey`/`endKey` props that picker computes; it owns no period state
 * of its own any more. `onDrillDown` reports a bar tap that should narrow
 * the shared period (Monat→Woche, Jahr→Monat, Alles→Jahr) back up to the
 * page, which owns that state; a Woche-bar tap still jumps straight to the
 * Feed for that day, unrelated to the shared period.
 *
 * "Tag" is the one period with no date-bucketed trend to plot (a single day
 * has no "day-over-day" shape) — its buckets are one per MEAL instead,
 * in the order logged, so the chart still reads as "how did today build
 * up" rather than being disabled outright.
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
 * same way as the real data for point-for-point alignment. Neither draws a
 * target line for "Tag" — a per-meal target has no real meaning.
 */
export function MacroTrendCard({
  macro,
  period,
  startKey,
  endKey,
  onDrillDown,
}: {
  macro: TrendMacro
  period: Period
  startKey: string
  endKey: string
  /** A bar/point was tapped that should narrow the page's shared period — e.g. a Monat week-bar reporting ('week', thatWeeksMonday). */
  onDrillDown: (period: Period, anchorKey: string) => void
}) {
  const navigate = useNavigate()
  const [legendOpen, setLegendOpen] = useState(false)

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

  const perMealBuckets = useMemo(() => buildPerMealBuckets(meals), [meals])
  const buckets = useMemo(
    () => (period === 'day' ? perMealBuckets : bucketByPeriod(period, startKey, endKey, nutritionByDate)),
    [period, startKey, endKey, nutritionByDate, perMealBuckets],
  )

  const bodyProfile = getBodyProfile()
  const dailyTargets = bodyProfile ? computeDailyTargets(bodyProfile) : null

  // kcal: real historical per-day targets. Others: today's flat target,
  // applied to every date in range then bucketed identically — see this
  // component's own doc comment. Called unconditionally either way (rules
  // of hooks) — its result is simply unused when macro isn't kcal or period is 'day'.
  const kcalTargetByDate = useDailyTargetKcalMap(period === 'day' ? '' : startKey, period === 'day' ? '' : endKey)
  const flatTargetByDate = useMemo(() => {
    if (macro === 'kcal' || !dailyTargets || period === 'day') return null
    const map = new Map<string, Nutrition>()
    for (let cur = new Date(`${startKey}T00:00:00`); toLocalDateKey(cur) <= endKey; cur.setDate(cur.getDate() + 1)) {
      const day: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      day[macro] = dailyTargets[macro]
      map.set(toLocalDateKey(cur), day)
    }
    return map
  }, [macro, dailyTargets, startKey, endKey, period])

  const targetNutritionByDate =
    period === 'day' ? null : macro === 'kcal' ? (kcalTargetByDate ? targetKcalAsNutritionMap(kcalTargetByDate) : null) : flatTargetByDate

  const targetBuckets = useMemo(() => {
    if (!targetNutritionByDate || period === 'day') return []
    return bucketByPeriod(period, startKey, endKey, targetNutritionByDate)
  }, [targetNutritionByDate, period, startKey, endKey])
  const targetByKey = targetNutritionByDate ? targetKcalByBucketKey(targetBuckets.map((b) => ({ ...b, kcal: b[macro] }))) : null

  const chartData: ChartBucket[] = buckets.map((b) => ({ ...b, kcal: b[macro], targetKcal: targetByKey?.get(b.key) ?? null }))

  function handleSelectBucket(bucket: StatBucket) {
    if (period === 'week') navigate('/', { state: { dateKey: bucket.key } })
    else if (period === 'month') onDrillDown('week', bucket.key)
    else if (period === 'year') onDrillDown('month', `${bucket.key}-01`)
    else if (period === 'all') onDrillDown('year', `${bucket.key.slice(0, 4)}-01-01`)
    // 'day': nothing finer to drill into — the chart's own tap-to-preview already shows the meal's macros.
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
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          aria-label="Legende zum Diagramm"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-ink-faint hover:text-ink-soft"
        >
          i
        </button>
      </div>
      <div className="min-h-56">
        {meals === undefined ? (
          <p className="flex h-56 items-center justify-center text-sm text-ink-soft">Lädt…</p>
        ) : (
          <KcalTrendChart
            data={chartData}
            targets={dailyTargets}
            emptyLabel="Keine Einträge in diesem Zeitraum."
            onSelectBucket={period === 'day' ? undefined : handleSelectBucket}
            lineColor={METRIC_COLOR[macro]}
          />
        )}
      </div>

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

/** "Tag" granularity: one bucket per logged meal, in the order they were added, rather than per date. */
function buildPerMealBuckets(meals: MealSummary[] | undefined): StatBucket[] {
  return [...(meals ?? [])]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((m) => ({
      key: m.id,
      label: MEAL_TYPE_LABELS[m.mealType],
      kcal: m.nutrition.kcal,
      protein: m.nutrition.protein,
      carbs: m.nutrition.carbs,
      fat: m.nutrition.fat,
    }))
}
