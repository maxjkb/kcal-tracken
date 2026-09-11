import { useMemo, useState } from 'react'
import { useMealSummariesInRange } from '../hooks/useMeals'
import { toLocalDateKey, type Nutrition } from '../lib/db'
import { classifyMaintenanceBalance, computeTDEE, getBodyProfile, type MaintenanceBalance } from '../lib/bodyProfile'
import { targetKcalAsNutritionMap, targetKcalByBucketKey, useDailyTargetKcalMap } from '../lib/targetHistory'
import { bucketByDay, computeAverageComparison, computeDailyAverage, computeDailyMacroAverages, formatPeriodLabel, getPeriodRange } from '../lib/stats'
import { PageHeader } from '../components/PageHeader'
import { GlassSurface } from '../glass/GlassSurface'
import { MacroIcon, type MacroType } from '../components/MacroIcon'
import { MacroTrendCard } from '../components/MacroTrendCard'
import { IllnessChart } from '../components/IllnessChart'
import { SupplementScoreCard } from '../components/SupplementScoreCard'
import { MicronutrientBars } from '../components/MicronutrientBars'
import { useMicronutrientOverview } from '../hooks/useMicronutrients'
import { STATS_TILE_META } from '../components/StatsTileMeta'
import { getStatsLayout, type StatsTileKey } from '../lib/statsLayout'
import { StatsLayoutSheet } from '../components/StatsLayoutSheet'

const MAINTENANCE_LABEL: Record<MaintenanceBalance, string> = {
  defizit: 'Defizit',
  erhaltung: 'Erhaltung',
  ueberschuss: 'Überschuss',
}

/**
 * Round 5 (v2.5): a full rebuild, not a tune-up. The page used to switch
 * between four entirely different "Ansichten" (Tag/Woche/Monat/Jahr), each
 * replacing everything below the header — explicit request to drop that
 * switching altogether: every chart now stands on the page at once, as one
 * long, user-reorderable feed (see lib/statsLayout.ts + StatsLayoutSheet).
 *
 * Three things stay fixed at the top, not part of that reorderable feed:
 * the three headline tiles (this week's balance / Ø kcal per day / Ø
 * macros) and the icon row beneath them that jumps straight to any chart
 * further down. Both always describe THIS calendar week — there is no
 * longer a page-level period to vary them by.
 */
export function StatsPage() {
  const [layout, setLayout] = useState<StatsTileKey[]>(getStatsLayout)
  const [editOpen, setEditOpen] = useState(false)

  const todayKey = toLocalDateKey(new Date())
  const { startKey, endKey } = getPeriodRange('week', todayKey)
  const meals = useMealSummariesInRange(startKey, endKey)

  const { nutritionByDate, totals } = useMemo(() => {
    const byDate = new Map<string, Nutrition>()
    const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    for (const m of meals ?? []) {
      const day = byDate.get(m.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      day.kcal += m.nutrition.kcal
      day.protein += m.nutrition.protein
      day.carbs += m.nutrition.carbs
      day.fat += m.nutrition.fat
      byDate.set(m.date, day)
      sum.kcal += m.nutrition.kcal
      sum.protein += m.nutrition.protein
      sum.carbs += m.nutrition.carbs
      sum.fat += m.nutrition.fat
    }
    return { nutritionByDate: byDate, totals: sum }
  }, [meals])

  const dailyAverage = computeDailyAverage(startKey, endKey, totals.kcal)
  const macroAverages = computeDailyMacroAverages(startKey, endKey, totals)

  const bodyProfile = getBodyProfile()
  const tdee = bodyProfile ? computeTDEE(bodyProfile) : null
  const maintenanceBalance = tdee !== null ? classifyMaintenanceBalance(dailyAverage, tdee) : null

  // "Bilanz" — this week's average vs. the user's own GOAL target
  // (Ziel−Ø), independent of the maintenance reading above (see
  // classifyMaintenanceBalance's own doc comment on why the two differ).
  const dayData = useMemo(() => bucketByDay(startKey, endKey, nutritionByDate), [startKey, endKey, nutritionByDate])
  const targetKcalByDate = useDailyTargetKcalMap(startKey, endKey)
  const targetNutritionByDate = useMemo(
    () => (targetKcalByDate ? targetKcalAsNutritionMap(targetKcalByDate) : new Map<string, Nutrition>()),
    [targetKcalByDate],
  )
  const targetDayData = useMemo(() => bucketByDay(startKey, endKey, targetNutritionByDate), [startKey, endKey, targetNutritionByDate])
  const targetKcalByKey = targetKcalByDate ? targetKcalByBucketKey(targetDayData) : null
  const averageComparison = targetKcalByKey ? computeAverageComparison(dayData, targetKcalByKey, todayKey) : null
  // "Ziel minus Durchschnitt" — negative means the average came in OVER
  // target (more eaten than planned), which is the state worth flagging.
  const calorieBalance = averageComparison ? -averageComparison.diff : null

  const microOverview = useMicronutrientOverview(endKey)

  function scrollToTile(key: StatsTileKey) {
    document.getElementById(`stats-tile-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const MicroIcon = STATS_TILE_META.micronutrients.icon

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <PageHeader title="Statistik" />

      <p className="mb-3 text-center text-xs font-medium text-ink-soft">{formatPeriodLabel('week', todayKey)}</p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed flex h-24 w-full flex-col items-center justify-center rounded-3xl p-3 text-center shadow-sm shadow-black/5">
          {averageComparison === null || calorieBalance === null ? (
            <>
              <div className="hero-num text-xl text-ink">{Math.round(totals.kcal).toLocaleString('de-DE')}</div>
              <div className="text-[10px] text-ink-soft">kcal gesamt</div>
            </>
          ) : (
            <>
              <div
                className="hero-num text-xl"
                style={{ color: calorieBalance < 0 ? 'var(--color-warning)' : 'var(--color-ink)' }}
              >
                {Math.round(Math.abs(calorieBalance)).toLocaleString('de-DE')}
              </div>
              <div className="text-[10px] text-ink-soft">{maintenanceBalance ? MAINTENANCE_LABEL[maintenanceBalance] : 'Bilanz'}</div>
            </>
          )}
        </GlassSurface>

        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed flex h-24 w-full flex-col items-center justify-center rounded-3xl p-3 text-center shadow-sm shadow-black/5">
          <div className="hero-num text-xl text-ink">{Math.round(dailyAverage).toLocaleString('de-DE')}</div>
          <div className="text-[10px] text-ink-soft">Ø kcal/d</div>
        </GlassSurface>

        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed flex h-24 w-full flex-col items-center justify-center gap-1 rounded-3xl p-3 shadow-sm shadow-black/5">
          {(['protein', 'carbs', 'fat'] as const satisfies readonly MacroType[]).map((type) => (
            <div key={type} className="flex w-full items-center justify-center gap-1.5">
              <span style={{ color: `var(--color-${type})` }}>
                <MacroIcon type={type} className="h-3 w-3" />
              </span>
              <span className="hero-num text-sm text-ink">{Math.round(macroAverages[type])}g</span>
            </div>
          ))}
        </GlassSurface>
      </div>

      {/* Jump row — plain icons on a small neutral chip, deliberately not a
          big tile of their own (explicit request): this is navigation, not
          content. Order mirrors the feed's own current order below. */}
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {layout.map((key) => {
          const Icon = STATS_TILE_META[key].icon
          return (
            <button
              key={key}
              type="button"
              onClick={() => scrollToTile(key)}
              aria-label={`Zu ${STATS_TILE_META[key].label} springen`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 active:scale-95"
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-4">
        {layout.map((key) => (
          <div key={key} id={`stats-tile-${key}`}>
            {key === 'kcal' && <MacroTrendCard macro="kcal" />}
            {key === 'protein' && <MacroTrendCard macro="protein" />}
            {key === 'carbs' && <MacroTrendCard macro="carbs" />}
            {key === 'fat' && <MacroTrendCard macro="fat" />}
            {key === 'suppScore' && <SupplementScoreCard />}
            {key === 'illness' && <IllnessChart />}
            {key === 'micronutrients' && (
              <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
                <div className="mb-3 flex items-center gap-1.5">
                  <span className="text-ink-soft">
                    <MicroIcon className="h-4 w-4" />
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Mikronährstoffe</h3>
                </div>
                <MicronutrientBars overview={microOverview} />
              </GlassSurface>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-faint"
        >
          <EditIcon />
          Bearbeiten
        </button>
      </div>

      {editOpen && (
        <StatsLayoutSheet
          onClose={() => {
            setEditOpen(false)
            setLayout(getStatsLayout())
          }}
        />
      )}
    </div>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
