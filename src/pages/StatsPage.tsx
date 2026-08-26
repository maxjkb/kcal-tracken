import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealSummariesInRange, type MealSummary } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, toLocalDateKey, type Nutrition } from '../lib/db'
import { ChevronIcon } from '../components/ChevronIcon'
import { DayShape } from '../components/DayShape'
import { DaySummary } from '../components/DaySummary'
import { DayPickerModal, MonthPickerModal, YearPickerModal } from '../components/DatePickerModal'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { SupplementAdherenceCard } from '../components/SupplementAdherenceCard'
import { MicronutrientBars } from '../components/MicronutrientBars'
import { useMicronutrientOverview } from '../hooks/useMicronutrients'
import { KcalTrendChart } from '../components/KcalTrendChart'
import type { StatBucket } from '../lib/stats'
import { PageHeader, HeaderButton } from '../components/PageHeader'
import { BouncingDots } from '../components/BouncingDots'
import {
  bucketByDay,
  bucketByMonth,
  bucketByWeek,
  computeDailyAverage,
  computeDailyMacroAverages,
  formatPeriodLabel,
  getPeriodRange,
  monthHeadingLabel,
  shiftAnchor,
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
  // Which of the two summaries the area below expands on. Chart first: the
  // shape over time is what the period views exist for, the macro breakdown is
  // the follow-up question.
  const [view, setView] = useState<'trend' | 'nutrients'>('trend')
  const { startKey, endKey } = getPeriodRange(period, anchorKey)
  const meals = useMealSummariesInRange(startKey, endKey)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExportPdf(meals: MealSummary[]) {
    setExporting(true)
    setExportError(null)
    try {
      // A plain dynamic import, not lazyRetry. lazyRetry exists for React.lazy
      // route chunks, where a stale cached index.html makes a full reload the
      // right recovery — but doing that here would throw away whatever the
      // user has open (an unsaved meal in a sheet, for instance) to recover a
      // PDF export they can simply retry. And the call site floated the
      // promise, so any other failure was an unhandled rejection: the button
      // just stopped spinning, with no PDF and no explanation.
      const { exportDiaryPdf } = await import('../lib/pdf')
      exportDiaryPdf({ period, anchorKey, meals, startKey, endKey })
    } catch (err) {
      setExportError(
        err instanceof Error && /import|fetch|network/i.test(err.message)
          ? 'PDF-Modul konnte nicht geladen werden. Internetverbindung prüfen und erneut versuchen.'
          : 'PDF konnte nicht erstellt werden.',
      )
    } finally {
      setExporting(false)
    }
  }

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
      {/* PDF export folds into the header's round-button cluster rather than
          keeping its own labelled pill — three round buttons plus the title
          still fit a 375px screen, two of them plus a wide pill would not.
          The label survives as the accessible name and the tooltip. */}
      <PageHeader
        title="Statistik"
        actions={
          <HeaderButton
            onClick={() => meals && handleExportPdf(meals)}
            disabled={!meals || meals.length === 0 || exporting}
            label={exporting ? 'Erstelle PDF…' : 'Als PDF exportieren'}
          >
            {exporting ? <BouncingDots /> : <PdfIcon />}
          </HeaderButton>
        }
      />

      {exportError && <p className="mb-4 text-sm font-medium text-danger">{exportError}</p>}

      {/* One shared pill slides between the segments (Motion `layoutId`)
          instead of each segment fading its own background in and out — the
          segmented-control behavior iOS uses, where the selection reads as a
          single object moving to the tapped option. */}
      <div className="glass-subtle glass-subtle-themed mb-4 flex gap-1.5 rounded-full p-1.5 shadow-sm shadow-black/5">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
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
      </div>

      <div className="glass-subtle glass-subtle-themed mb-4 flex items-center justify-between rounded-2xl px-2 py-2 shadow-sm shadow-black/5">
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, -1))}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent"
          aria-label="Vorheriger Zeitraum"
        >
          <ChevronIcon direction="left" />
        </button>
        <button onClick={() => setPickerOpen(true)} className="px-3 py-3 text-sm font-medium text-ink hover:opacity-70">
          {formatPeriodLabel(period, anchorKey)}
        </button>
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent"
          aria-label="Nächster Zeitraum"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatTile value={Math.round(totals.kcal).toLocaleString('de-DE')} label="kcal gesamt" />
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
          {/* Mikronährstoffe first, Makronährstoffe demoted below it — per
              the same brainstorm this shipped from: macros stay available
              here, they just aren't the first thing the eye lands on. */}
          <div className="glass-subtle glass-subtle-themed mb-4 rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Mikronährstoffe</h3>
            <MicronutrientBars overview={microOverview} />
          </div>
          <div className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Makronährstoffe</h3>
            {meals === undefined ? (
              <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
            ) : perMealData.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-soft">Keine Mahlzeiten an diesem Tag.</p>
            ) : (
              <DaySummary values={totals} targets={dailyTargets} caption="Tag" />
            )}
          </div>
        </>
      ) : view === 'nutrients' ? (
        <>
          <div className="glass-subtle glass-subtle-themed mb-4 rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Mikronährstoffe</h3>
            <MicronutrientBars overview={microOverview} />
          </div>
          {/* The Feed's own daily breakdown, applied to the period's average —
              same rings, same colours, same percent-of-target readout, so the
              number in the tile above and the detail below are visibly the
              same thing at two levels of zoom. */}
          <div className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Makronährstoffe</h3>
            {meals === undefined ? (
              <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
            ) : (
              <DaySummary
                values={{
                  kcal: dailyAverage,
                  protein: macroAverages.protein,
                  carbs: macroAverages.carbs,
                  fat: macroAverages.fat,
                }}
                targets={dailyTargets}
                caption="Ø pro Tag"
              />
            )}
          </div>
        </>
      ) : (
        <div className="rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
          {(period === 'week' || period === 'month') && meals !== undefined && barData.length > 0 && (
            <div className="mb-2 text-xs font-semibold text-ink-soft">{monthHeadingLabel(startKey, endKey)}</div>
          )}
          {/* min-h rather than a fixed h-56: the detail panel opens inside this
              box, and a fixed height would squeeze the chart instead of letting
              the card grow. */}
          <div className="min-h-56">
            {meals === undefined ? (
              <p className="flex h-56 items-center justify-center text-sm text-ink-soft">Lädt…</p>
            ) : (
              <KcalTrendChart
                data={period === 'year' ? monthData : barData}
                unitLabel={period === 'year' ? 'Monat' : period === 'month' ? 'Woche' : 'Tag'}
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

      <SupplementAdherenceCard startKey={startKey} endKey={endKey} />

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
  label,
  selected,
  onSelect,
}: {
  value: string
  label: string
  selected?: boolean
  onSelect?: () => void
}) {
  const body = (
    <>
      {/* Display face — a stat tile's figure is one of the three places the
          brief allows it, and tabular lining figures keep the three tiles'
          numbers optically aligned with each other. */}
      <div className="type-figure text-xl text-ink">{value}</div>
      <div className="text-[10px] text-ink-soft">{label}</div>
    </>
  )
  const shell = `flex h-24 w-full flex-col items-center justify-center rounded-3xl p-3 text-center shadow-sm shadow-black/5 transition ${
    selected ? 'bg-surface ring-2 ring-inset ring-accent' : 'bg-surface'
  }`

  if (!onSelect) return <div className={shell}>{body}</div>
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={shell}>
      {body}
    </button>
  )
}

/**
 * The 3rd tile of the stat row — the day shape at tile size, the same graphic
 * the Feed leads with. Kept identical across all four periods, and identical
 * to the large one below it: HIG (Charting Data) — "Maintain continuity among
 * multiple charts that use the same data… use one chart type and consistent
 * colors, annotations, layouts."
 */
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
      <DayShape values={{ kcal, protein, carbs, fat }} targets={targets} size={52} />
      <div className="text-[10px] leading-tight text-ink-soft">{caption}</div>
    </>
  )
  const shell = `flex h-24 w-full flex-col items-center justify-center gap-1 rounded-3xl p-2 text-center shadow-sm shadow-black/5 transition ${
    selected ? 'bg-surface ring-2 ring-inset ring-accent' : 'bg-surface'
  }`

  if (!onSelect) return <div className={shell}>{body}</div>
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={shell}>
      {body}
    </button>
  )
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path d="M14 2v6h6" />
      <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" d="M8 17v-5m3 5v-5m0 0c1.5 0 2.5.7 2.5 2s-1 2-2.5 2" />
    </svg>
  )
}
