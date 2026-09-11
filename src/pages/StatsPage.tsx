import { useMemo, useState } from 'react'
import { useEarliestMealDate, useMealSummariesInRange } from '../hooks/useMeals'
import { toLocalDateKey, type Nutrition } from '../lib/db'
import { classifyMaintenanceBalance, computeTDEE, getBodyProfile, type MaintenanceBalance } from '../lib/bodyProfile'
import { targetKcalAsNutritionMap, targetKcalByBucketKey, useDailyTargetKcalMap } from '../lib/targetHistory'
import {
  bucketByDay,
  computeAverageComparison,
  computeDailyAverage,
  computeDailyMacroAverages,
  formatPeriodLabel,
  getPeriodRange,
  type Period,
} from '../lib/stats'
import { PageHeader } from '../components/PageHeader'
import { GlassSurface } from '../glass/GlassSurface'
import { MacroIcon, type MacroType } from '../components/MacroIcon'
import { MacroTrendCard } from '../components/MacroTrendCard'
import { SusceptibilityCard } from '../components/SusceptibilityCard'
import { ThermometerIcon } from '../components/SickDayButton'
import { SupplementScoreCard } from '../components/SupplementScoreCard'
import { MicronutrientBars } from '../components/MicronutrientBars'
import { useMicronutrientOverview } from '../hooks/useMicronutrients'
import { STATS_TILE_META } from '../components/StatsTileMeta'
import { getStatsLayout, type StatsTileKey } from '../lib/statsLayout'
import { StatsLayoutSheet } from '../components/StatsLayoutSheet'
import { ExpandablePicker, type PickerOption } from '../components/ExpandablePicker'
import { AllIcon, DayIcon, MonthIcon, WeekIcon, YearIcon } from '../components/PickerIcons'
import { DayPickerModal, MonthPickerModal, YearPickerModal } from '../components/DatePickerModal'

const MAINTENANCE_LABEL: Record<MaintenanceBalance, string> = {
  defizit: 'Defizit',
  erhaltung: 'Erhaltung',
  ueberschuss: 'Überschuss',
}

const PERIOD_OPTIONS: PickerOption<Period>[] = [
  { key: 'day', label: 'Tag', icon: DayIcon },
  { key: 'week', label: 'Woche', icon: WeekIcon },
  { key: 'month', label: 'Monat', icon: MonthIcon },
  { key: 'year', label: 'Jahr', icon: YearIcon },
  { key: 'all', label: 'Alles', icon: AllIcon },
]

const TREND_MACROS: StatsTileKey[] = ['kcal', 'protein', 'carbs', 'fat']

/**
 * Round 6 (v2.6) reverses part of Round 5: the page-level Tag/Woche/Monat/
 * Jahr picker is back, now with a fifth "Alles" option (the entire recorded
 * history — see useEarliestMealDate), and it's the ONE place that period is
 * chosen — explicit request that switching it should happen centrally
 * rather than per-chart (Round 5 had briefly moved a Woche/Monat/Jahr
 * toggle onto each trend card individually). Only the four adaptive trend
 * charts (kcal/protein/carbs/fat, via MacroTrendCard) actually respond to
 * it; Supp-Score, Krankheit and Mikronährstoffe don't have a "period" of
 * their own to vary and stay exactly as they are regardless of what's
 * selected here — each says so in its own info text.
 *
 * The three headline tiles (balance/Ø-kcal/macros) and the chart-jump icon
 * row stay independent of this picker too, same as Round 5: they always
 * describe THIS calendar week specifically, not whatever period is
 * currently selected for the charts below.
 */
export function StatsPage() {
  const [layout, setLayout] = useState<StatsTileKey[]>(getStatsLayout)
  const [editOpen, setEditOpen] = useState(false)

  const todayKey = toLocalDateKey(new Date())

  // --- Headline tiles: always this calendar week, independent of the picker below ---
  const { startKey: weekStartKey, endKey: weekEndKey } = getPeriodRange('week', todayKey)
  const meals = useMealSummariesInRange(weekStartKey, weekEndKey)

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

  const dailyAverage = computeDailyAverage(weekStartKey, weekEndKey, totals.kcal)
  const macroAverages = computeDailyMacroAverages(weekStartKey, weekEndKey, totals)

  const bodyProfile = getBodyProfile()
  const tdee = bodyProfile ? computeTDEE(bodyProfile) : null
  const maintenanceBalance = tdee !== null ? classifyMaintenanceBalance(dailyAverage, tdee) : null

  // "Bilanz" — this week's average vs. the user's own GOAL target
  // (Ziel−Ø), independent of the maintenance reading above (see
  // classifyMaintenanceBalance's own doc comment on why the two differ).
  const dayData = useMemo(() => bucketByDay(weekStartKey, weekEndKey, nutritionByDate), [weekStartKey, weekEndKey, nutritionByDate])
  const targetKcalByDate = useDailyTargetKcalMap(weekStartKey, weekEndKey)
  const targetNutritionByDate = useMemo(
    () => (targetKcalByDate ? targetKcalAsNutritionMap(targetKcalByDate) : new Map<string, Nutrition>()),
    [targetKcalByDate],
  )
  const targetDayData = useMemo(
    () => bucketByDay(weekStartKey, weekEndKey, targetNutritionByDate),
    [weekStartKey, weekEndKey, targetNutritionByDate],
  )
  const targetKcalByKey = targetKcalByDate ? targetKcalByBucketKey(targetDayData) : null
  const averageComparison = targetKcalByKey ? computeAverageComparison(dayData, targetKcalByKey, todayKey) : null
  // "Ziel minus Durchschnitt" — negative means the average came in OVER
  // target (more eaten than planned), which is the state worth flagging.
  const calorieBalance = averageComparison ? -averageComparison.diff : null

  const microOverview = useMicronutrientOverview(weekEndKey)

  // --- Central period picker, driving the four adaptive trend charts ---
  const [period, setPeriod] = useState<Period>('week')
  const [anchorKey, setAnchorKey] = useState(() => todayKey)
  const [anchorPickerOpen, setAnchorPickerOpen] = useState(false)
  const earliestMealDate = useEarliestMealDate()
  const { startKey: chartStartKey, endKey: chartEndKey } =
    period === 'all' ? { startKey: earliestMealDate ?? todayKey, endKey: todayKey } : getPeriodRange(period, anchorKey)

  function handleDrillDown(nextPeriod: Period, nextAnchor: string) {
    setPeriod(nextPeriod)
    setAnchorKey(nextAnchor)
  }

  function scrollToTile(key: StatsTileKey) {
    document.getElementById(`stats-tile-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const MicroIcon = STATS_TILE_META.micronutrients.icon
  const SuppScoreIcon = STATS_TILE_META.suppScore.icon

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

      {/* Central period picker — drives only the four adaptive trend charts below. */}
      <ExpandablePicker options={PERIOD_OPTIONS} value={period} onChange={setPeriod} label="Zeitraum" />
      <div className="mb-6 flex justify-center">
        {period === 'all' ? (
          <p className="text-xs font-medium text-ink-soft">{formatPeriodLabel('all', anchorKey)}</p>
        ) : (
          <button
            type="button"
            onClick={() => setAnchorPickerOpen(true)}
            className="text-xs font-medium text-ink-soft underline decoration-dotted underline-offset-2"
          >
            {period === 'year' ? anchorKey.slice(0, 4) : formatPeriodLabel(period, anchorKey)}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {layout.map((key) => (
          <div key={key} id={`stats-tile-${key}`}>
            {TREND_MACROS.includes(key) && (
              <MacroTrendCard
                macro={key as 'kcal' | 'protein' | 'carbs' | 'fat'}
                period={period}
                startKey={chartStartKey}
                endKey={chartEndKey}
                onDrillDown={handleDrillDown}
              />
            )}
            {key === 'suppScore' && (
              <>
                <SupplementScoreCard />
                <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[10px] text-ink-faint">
                  <SuppScoreIcon className="h-3 w-3" />
                  Unabhängig vom oben gewählten Zeitraum — läuft seit Beginn durchgehend mit.
                </p>
              </>
            )}
            {key === 'illness' && (
              <>
                <SusceptibilityCard />
                <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[10px] text-ink-faint">
                  <ThermometerIcon className="h-3 w-3" />
                  Unabhängig vom oben gewählten Zeitraum — der Score aktualisiert sich höchstens einmal pro Woche.
                </p>
              </>
            )}
            {key === 'micronutrients' && (
              <GlassSurface rim={24} className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
                <div className="mb-3 flex items-center gap-1.5">
                  <span className="text-ink-soft">
                    <MicroIcon className="h-4 w-4" />
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Mikronährstoffe</h3>
                </div>
                <MicronutrientBars overview={microOverview} />
                <p className="mt-2 text-[10px] text-ink-faint">
                  Unabhängig vom oben gewählten Zeitraum — zeigt immer die letzten Wochen.
                </p>
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

      {anchorPickerOpen && (period === 'day' || period === 'week') && (
        <DayPickerModal
          selectedDateKey={anchorKey}
          onSelect={(key) => { setAnchorKey(key); setAnchorPickerOpen(false) }}
          onClose={() => setAnchorPickerOpen(false)}
        />
      )}
      {anchorPickerOpen && period === 'month' && (
        <MonthPickerModal
          selectedYear={Number(anchorKey.slice(0, 4))}
          selectedMonth={Number(anchorKey.slice(5, 7))}
          onSelect={(year, month) => { setAnchorKey(`${year}-${String(month).padStart(2, '0')}-01`); setAnchorPickerOpen(false) }}
          onClose={() => setAnchorPickerOpen(false)}
        />
      )}
      {anchorPickerOpen && period === 'year' && (
        <YearPickerModal
          selectedYear={Number(anchorKey.slice(0, 4))}
          onSelect={(year) => { setAnchorKey(`${year}-01-01`); setAnchorPickerOpen(false) }}
          onClose={() => setAnchorPickerOpen(false)}
        />
      )}

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
