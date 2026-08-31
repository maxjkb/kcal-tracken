import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealSummariesInRange } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, toLocalDateKey, type Nutrition } from '../lib/db'
import { ConcentricRings, NutrientRings } from '../components/NutrientRings'
import { DayPickerModal, MonthPickerModal, YearPickerModal } from '../components/DatePickerModal'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { SupplementScoreCard } from '../components/SupplementScoreCard'
import { MicronutrientBars } from '../components/MicronutrientBars'
import { useMicronutrientOverview } from '../hooks/useMicronutrients'
import { KcalTrendChart, type ChartBucket } from '../components/KcalTrendChart'
import { ChartLegendSheet } from '../components/ChartLegendSheet'
import type { StatBucket } from '../lib/stats'
import { targetKcalAsNutritionMap, targetKcalByBucketKey, useDailyTargetKcalMap } from '../lib/targetHistory'
import { PageHeader } from '../components/PageHeader'
import { GlassSurface } from '../glass/GlassSurface'
import {
  bucketByDay,
  bucketByMonth,
  bucketByWeek,
  computeAverageComparison,
  computeDailyAverage,
  computeDailyMacroAverages,
  formatPeriodLabel,
  getPeriodRange,
  monthHeadingLabel,
  type Period,
} from '../lib/stats'

import { motion, useReducedMotion } from 'motion/react'
import { SPRING_SNAPPY } from '../lib/motionTokens'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'year', label: 'Jahr' },
]

export function StatsPage() {
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [period, setPeriod] = useState<Period>('week')
  const [anchorKey, setAnchorKey] = useState(() => toLocalDateKey(new Date()))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  // Which of the two summaries the area below expands on. Chart first: the
  // shape over time is what the period views exist for, the macro breakdown is
  // the follow-up question.
  const [view, setView] = useState<'trend' | 'nutrients'>('trend')
  const { startKey, endKey } = getPeriodRange(period, anchorKey)
  const meals = useMealSummariesInRange(startKey, endKey)

  // Per-day totals across all four macros, not just kcal: the chart's points
  // are tappable and open the full nutrient rings for that day or week.
  const nutritionByDate = new Map<string, Nutrition>()
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const m of meals ?? []) {
    const day = nutritionByDate.get(m.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    day.kcal += m.nutrition.kcal
    day.protein += m.nutrition.protein
    day.carbs += m.nutrition.carbs
    day.fat += m.nutrition.fat
    nutritionByDate.set(m.date, day)
    totals.kcal += m.nutrition.kcal
    totals.protein += m.nutrition.protein
    totals.carbs += m.nutrition.carbs
    totals.fat += m.nutrition.fat
  }

  const mealCount = meals?.length ?? 0
  const dailyAverage = computeDailyAverage(startKey, endKey, totals.kcal)
  const macroAverages = computeDailyMacroAverages(startKey, endKey, totals)
  const perMealAverages =
    mealCount > 0
      ? {
          kcal: totals.kcal / mealCount,
          protein: totals.protein / mealCount,
          carbs: totals.carbs / mealCount,
          fat: totals.fat / mealCount,
        }
      : { kcal: 0, protein: 0, carbs: 0, fat: 0 }

  const bodyProfile = getBodyProfile()
  const dailyTargets = bodyProfile ? computeDailyTargets(bodyProfile) : null
  // Always the trailing week ending at the period's own end date, regardless
  // of which period (Tag/Woche/Monat/Jahr) is selected: the bands are a
  // "how am I doing lately" read, not a value to sum or average further over
  // a longer browsed range the way kcal/macros are above.
  const microOverview = useMicronutrientOverview(endKey)

  // Woche bars = days (click → that day's Tag view); Monat bars = weeks
  // (click → that week's Woche view); Jahr points = months (click → that
  // month's Monat view) — each period's chart drills into the next-finer one.
  const dayData = period === 'week' ? bucketByDay(startKey, endKey, nutritionByDate) : []
  const weekData = period === 'month' ? bucketByWeek(startKey, endKey, nutritionByDate) : []
  const monthData = period === 'year' ? bucketByMonth(Number(anchorKey.slice(0, 4)), nutritionByDate) : []
  const barData = period === 'week' ? dayData : period === 'month' ? weekData : []

  // The target-kcal line on the trend chart, bucketed the exact same way as
  // the actual-intake data above (same functions, same keys) so the two line
  // up point for point. null/undefined (no body profile yet) hides the line
  // entirely rather than drawing it at 0.
  const targetKcalByDate = useDailyTargetKcalMap(startKey, endKey)
  const targetNutritionByDate = targetKcalByDate ? targetKcalAsNutritionMap(targetKcalByDate) : new Map<string, Nutrition>()
  const targetDayData = period === 'week' ? bucketByDay(startKey, endKey, targetNutritionByDate) : []
  const targetWeekData = period === 'month' ? bucketByWeek(startKey, endKey, targetNutritionByDate) : []
  const targetMonthData = period === 'year' ? bucketByMonth(Number(anchorKey.slice(0, 4)), targetNutritionByDate) : []
  const targetKcalByKey = targetKcalByDate
    ? targetKcalByBucketKey([...targetDayData, ...targetWeekData, ...targetMonthData])
    : null
  function withTarget(buckets: StatBucket[]): ChartBucket[] {
    return buckets.map((b) => ({ ...b, targetKcal: targetKcalByKey?.get(b.key) ?? null }))
  }

  // Tile 1 ("kcal gesamt" on Tag) becomes a surplus/deficit readout on the
  // other three periods, one granularity up from what's charted: Woche
  // averages day-by-day, Monat week-by-week, Jahr month-by-month (see
  // computeAverageComparison). Reuses the exact buckets/lookup already built
  // above for the chart — only the "today" key needs adjusting for Jahr's
  // YYYY-MM bucket keys.
  const todayKey = toLocalDateKey(new Date())
  const deficitBuckets = period === 'week' ? dayData : period === 'month' ? weekData : period === 'year' ? monthData : []
  const deficitTodayKey = period === 'year' ? todayKey.slice(0, 7) : todayKey
  const averageComparison = targetKcalByKey ? computeAverageComparison(deficitBuckets, targetKcalByKey, deficitTodayKey) : null
  // "Ziel minus Durchschnitt", per explicit request — the inverse of
  // averageComparison.diff (actual − target): positive means the average
  // came in under target (a deficit, shown red), zero-or-negative means at
  // or over it (shown blue). Deliberately the user's own color mapping, not
  // the more common "red = over target" convention.
  const calorieBalance = averageComparison ? -averageComparison.diff : null
  const perMealData =
    period === 'day'
      ? [...(meals ?? [])]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((m) => ({ key: m.id, label: MEAL_TYPE_LABELS[m.mealType], kcal: m.nutrition.kcal }))
      : []

  // The 3rd tile's ring shows the day's absolute totals on Tag, and daily
  // averages (vs. the same daily targets) on Woche/Monat/Jahr — comparing a
  // multi-day sum directly against a one-day target wouldn't mean anything.
  const ringValues =
    period === 'day'
      ? totals
      : { kcal: dailyAverage, protein: macroAverages.protein, carbs: macroAverages.carbs, fat: macroAverages.fat }

  function handleBarClick(payload: { key: string } | undefined) {
    if (!payload) return
    if (period === 'week') navigate('/', { state: { dateKey: payload.key } })
    else if (period === 'month') {
      setPeriod('week')
      setAnchorKey(payload.key)
    }
  }

  function handleMonthPointClick(monthKey: string | undefined) {
    if (!monthKey) return
    setPeriod('month')
    setAnchorKey(`${monthKey}-01`)
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <PageHeader title="Statistik" />

      {/* One shared pill slides between the segments (Motion `layoutId`)
          instead of each segment fading its own background in and out — the
          segmented-control behavior iOS uses, where the selection reads as a
          single object moving to the tapped option. */}
      {/* Full .glass, not .glass-subtle — a segmented control is navigation
          the same way BottomNav is, so it gets the same material. */}
      <GlassSurface rim={22} className="glass mb-4 flex gap-1.5 rounded-full p-1.5 shadow-sm shadow-black/5">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            // Tapping the period you're already on has nothing left to
            // switch to, so that tap now opens the calendar sheet instead —
            // the trigger the date-navigator's own middle tile used to be,
            // before it was removed below in favor of this.
            onClick={() => (period === key ? setPickerOpen(true) : setPeriod(key))}
            className={`relative flex-1 rounded-full py-3 text-sm font-medium transition-colors ${
              period === key ? 'text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {period === key && (
              <motion.span
                layoutId="stats-period-pill"
                className="absolute inset-0 rounded-full bg-section-20"
                transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
              />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </GlassSurface>

      {/* The prev/next arrow tile is gone — the calendar sheet (a second tap
          on the active pill above) is now the only way to change the shown
          period, so there was nothing left for a dedicated navigator bar to
          do besides report where those arrows used to point. This plain
          line still does that reporting job, just without a card or a
          control either side of it. */}
      <p className="mb-4 text-center text-sm font-medium text-ink-soft">{formatPeriodLabel(period, anchorKey)}</p>

      <div className="mb-6 grid grid-cols-3 gap-2">
        {/* Tag keeps the plain daily total. Woche/Monat/Jahr swap it for a
            surplus/deficit readout instead — the absolute total of a whole
            month means little on its own, but "on average, how do I compare
            to what I need" does. Falls back to the plain total when there's
            nothing to compare against yet (no body profile, or the target
            history is still loading). */}
        {period === 'day' || averageComparison === null || calorieBalance === null ? (
          <StatTile value={Math.round(totals.kcal).toLocaleString('de-DE')} label="kcal gesamt" />
        ) : (
          // No words anywhere on this tile per explicit request — just the
          // bare balance (colored) over the bare target number (gray).
          <StatTile
            value={Math.round(Math.abs(calorieBalance)).toLocaleString('de-DE')}
            valueClassName={calorieBalance > 0 ? 'text-danger' : 'text-kcal'}
            label={Math.round(averageComparison.target).toLocaleString('de-DE')}
          />
        )}
        <StatTile
          value={Math.round(period === 'day' ? perMealAverages.kcal : dailyAverage).toLocaleString('de-DE')}
          label={period === 'day' ? 'Ø kcal / Mahlzeit' : 'Ø kcal / Tag'}
          selected={period !== 'day' && view === 'trend'}
          onSelect={period === 'day' ? undefined : () => setView('trend')}
        />
        <RingTile
          kcal={ringValues.kcal}
          protein={ringValues.protein}
          carbs={ringValues.carbs}
          fat={ringValues.fat}
          targets={dailyTargets}
          caption={period === 'day' ? 'Nährwerte' : 'Ø Nährwerte/Tag'}
          selected={period !== 'day' && view === 'nutrients'}
          onSelect={period === 'day' ? undefined : () => setView('nutrients')}
        />
      </div>

      {period === 'day' ? (
        <>
          {/* Makronährstoffe first, Mikronährstoffe below on scroll — back to
              this order after trying micros-first: kcal/protein/carbs/fat is
              still the number people check first on a given day, with the
              micronutrient picture as the deeper, second-glance layer below
              it rather than the very first thing on the page. */}
          <GlassSurface rim={24} className="glass-subtle glass-subtle-themed mb-4 rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Makronährstoffe</h3>
            {meals === undefined ? (
              <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
            ) : perMealData.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-soft">Keine Mahlzeiten an diesem Tag.</p>
            ) : (
              <NutrientRings
                kcal={totals.kcal}
                protein={totals.protein}
                carbs={totals.carbs}
                fat={totals.fat}
                targets={dailyTargets}
                perMeal={perMealAverages}
              />
            )}
          </GlassSurface>
          <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Mikronährstoffe</h3>
            <MicronutrientBars overview={microOverview} />
          </GlassSurface>
        </>
      ) : view === 'nutrients' ? (
        <>
          {/* The Feed's own daily breakdown, applied to the period's average —
              same rings, same colours, same percent-of-target readout, so the
              number in the tile above and the detail below are visibly the
              same thing at two levels of zoom. */}
          <GlassSurface rim={24} className="glass-subtle glass-subtle-themed mb-4 rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Makronährstoffe</h3>
            {meals === undefined ? (
              <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
            ) : (
              <NutrientRings
                kcal={dailyAverage}
                protein={macroAverages.protein}
                carbs={macroAverages.carbs}
                fat={macroAverages.fat}
                targets={dailyTargets}
              />
            )}
          </GlassSurface>
          <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Mikronährstoffe</h3>
            <MicronutrientBars overview={microOverview} />
          </GlassSurface>
        </>
      ) : (
        <div className="rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
          {/* The "i" sits on the same line as this card's own heading, per
              explicit request — even on Jahr, which has no heading text of
              its own, `justify-between` still pushes it to the right. */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-soft">
              {(period === 'week' || period === 'month') && meals !== undefined && barData.length > 0
                ? monthHeadingLabel(startKey, endKey)
                : ''}
            </span>
            <button
              type="button"
              onClick={() => setLegendOpen(true)}
              aria-label="Legende zum Diagramm"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-ink-faint hover:text-ink-soft"
            >
              i
            </button>
          </div>
          {/* min-h rather than a fixed h-56: the detail panel opens inside this
              box, and a fixed height would squeeze the chart instead of letting
              the card grow. */}
          <div className="min-h-56">
            {meals === undefined ? (
              <p className="flex h-56 items-center justify-center text-sm text-ink-soft">Lädt…</p>
            ) : (
              <KcalTrendChart
                data={withTarget(period === 'year' ? monthData : barData)}
                targets={dailyTargets}
                emptyLabel="Keine Einträge in diesem Zeitraum."
                onSelectBucket={(bucket: StatBucket) =>
                  period === 'year' ? handleMonthPointClick(bucket.key) : handleBarClick({ key: bucket.key })
                }
              />
            )}
          </div>
        </div>
      )}

      <SupplementScoreCard />

      {pickerOpen && period === 'day' && (
        <DayPickerModal
          selectedDateKey={anchorKey}
          onSelect={(key) => {
            setAnchorKey(key)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {pickerOpen && period === 'week' && (
        <DayPickerModal
          selectedDateKey={anchorKey}
          onSelect={(key) => {
            // Picking any day selects the week that contains it — the anchor
            // just needs to be that day, getPeriodRange('week', …) does the rest.
            setAnchorKey(key)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {pickerOpen && period === 'month' && (
        <MonthPickerModal
          selectedYear={Number(anchorKey.slice(0, 4))}
          selectedMonth={Number(anchorKey.slice(5, 7))}
          onSelect={(year, month) => {
            setAnchorKey(`${year}-${String(month).padStart(2, '0')}-01`)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {pickerOpen && period === 'year' && (
        <YearPickerModal
          selectedYear={Number(anchorKey.slice(0, 4))}
          onSelect={(year) => {
            setAnchorKey(`${year}-01-01`)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {legendOpen && (
        <ChartLegendSheet hasTargetLine={Boolean(targetKcalByKey)} onClose={() => setLegendOpen(false)} />
      )}
    </div>
  )
}

/**
 * One tile of the stat row.
 *
 * When `onSelect` is given the tile becomes the control that chooses what the
 * area below shows, and `selected` marks which one is active. The numbers were
 * already the two summaries of the period, so making them the switch keeps the
 * page from growing a separate row of tabs that says the same thing twice.
 */
function StatTile({
  value,
  valueClassName = 'text-ink',
  label,
  selected,
  onSelect,
}: {
  value: string
  /** Overrides the value's color — used by the deficit/surplus tile below, everything else keeps the default. */
  valueClassName?: string
  label: string
  selected?: boolean
  onSelect?: () => void
}) {
  const body = (
    <>
      <div className={`text-xl font-bold ${valueClassName}`}>{value}</div>
      <div className="text-[10px] text-ink-soft">{label}</div>
    </>
  )
  const shell = `flex h-24 w-full flex-col items-center justify-center rounded-3xl p-3 text-center shadow-sm shadow-black/5 transition ${
    selected ? 'ring-2 ring-inset ring-accent' : ''
  }`

  if (!onSelect) {
    return (
      <GlassSurface rim={24} className={`glass-subtle glass-subtle-themed ${shell}`}>
        {body}
      </GlassSurface>
    )
  }
  return (
    <GlassSurface
      as="button"
      rim={24}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`glass-subtle glass-subtle-themed ${shell}`}
    >
      {body}
    </GlassSurface>
  )
}

/** The 3rd tile of the stat row — the compact concentric ring, the app's signature nutrient visualization, used identically across all four periods. */
function RingTile({
  kcal,
  protein,
  carbs,
  fat,
  targets,
  caption,
  selected,
  onSelect,
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: { kcal: number; protein: number; carbs: number; fat: number } | null
  caption: string
  selected?: boolean
  onSelect?: () => void
}) {
  const body = (
    <>
      <ConcentricRings kcal={kcal} protein={protein} carbs={carbs} fat={fat} targets={targets} size="compact" />
      <div className="text-[10px] leading-tight text-ink-soft">{caption}</div>
    </>
  )
  const shell = `flex h-24 w-full flex-col items-center justify-center gap-1 rounded-3xl p-2 text-center shadow-sm shadow-black/5 transition ${
    selected ? 'ring-2 ring-inset ring-accent' : ''
  }`

  if (!onSelect) {
    return (
      <GlassSurface rim={24} className={`glass-subtle glass-subtle-themed ${shell}`}>
        {body}
      </GlassSurface>
    )
  }
  return (
    <GlassSurface
      as="button"
      rim={24}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`glass-subtle glass-subtle-themed ${shell}`}
    >
      {body}
    </GlassSurface>
  )
}
