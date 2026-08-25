import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMealSummariesInRange, type MealSummary } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, toLocalDateKey } from '../lib/db'
import { ChevronIcon } from '../components/ChevronIcon'
import { ConcentricRings, NutrientRings } from '../components/NutrientRings'
import { DayPickerModal, MonthPickerModal, YearPickerModal } from '../components/DatePickerModal'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { SupplementAdherenceCard } from '../components/SupplementAdherenceCard'
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

  const kcalByDate = new Map<string, number>()
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const m of meals ?? []) {
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + m.nutrition.kcal)
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

  // Woche bars = days (click → that day's Tag view); Monat bars = weeks
  // (click → that week's Woche view); Jahr points = months (click → that
  // month's Monat view) — each period's chart drills into the next-finer one.
  const dayData = period === 'week' ? bucketByDay(startKey, endKey, kcalByDate) : []
  const weekData = period === 'month' ? bucketByWeek(startKey, endKey, kcalByDate) : []
  const monthData = period === 'year' ? bucketByMonth(Number(anchorKey.slice(0, 4)), kcalByDate) : []
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
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      {/* PDF export folds into the header's round-button cluster rather than
          keeping its own labelled pill — three round buttons plus the title
          still fit a 375px screen, two of them plus a wide pill would not.
          The label survives as the accessible name and the tooltip. */}
      <PageHeader
        title="Statistik"
        className="mb-4"
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
            className={`relative flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
          aria-label="Vorheriger Zeitraum"
        >
          <ChevronIcon direction="left" />
        </button>
        <button onClick={() => setPickerOpen(true)} className="text-sm font-medium text-ink hover:opacity-70">
          {formatPeriodLabel(period, anchorKey)}
        </button>
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
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
        />
        <RingTile
          kcal={ringValues.kcal}
          protein={ringValues.protein}
          carbs={ringValues.carbs}
          fat={ringValues.fat}
          targets={dailyTargets}
          caption={period === 'day' ? 'Nährwerte' : 'Ø Nährwerte/Tag'}
        />
      </div>

      {period === 'day' ? (
        <div className="glass-subtle glass-subtle-themed rounded-3xl p-5 shadow-sm shadow-black/5">
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
        </div>
      ) : (
      <div className="rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        {(period === 'week' || period === 'month') && meals !== undefined && barData.length > 0 && (
          <div className="mb-2 text-xs font-semibold text-ink-soft">{monthHeadingLabel(startKey, endKey)}</div>
        )}
        <div className="h-56">
          {meals === undefined ? (
            <p className="flex h-full items-center justify-center text-sm text-ink-soft">Lädt…</p>
          ) : period === 'year' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthData}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                onClick={(state) => handleMonthPointClick(monthData.find((d) => d.label === state?.activeLabel)?.key)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
                <XAxis dataKey="label" stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12 }}
                  labelStyle={{ color: '#1d1d1f' }}
                  formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Gesamt']}
                />
                <Line
                  type="monotone"
                  dataKey="kcal"
                  stroke="#0a84ff"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#0a84ff', cursor: 'pointer' }}
                  activeDot={{ r: 5, cursor: 'pointer' }}
                  cursor="pointer"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
                <XAxis dataKey="label" stroke="#6e6e73" fontSize={11} tickLine={false} axisLine={false} interval={0} />
                <YAxis stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12 }}
                  labelStyle={{ color: '#1d1d1f' }}
                  formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Kalorien']}
                />
                <Bar
                  dataKey="kcal"
                  fill="#0a84ff"
                  radius={[6, 6, 0, 0]}
                  cursor="pointer"
                  onClick={(data) => handleBarClick((data as { payload?: { key: string } })?.payload)}
                />
              </BarChart>
            </ResponsiveContainer>
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

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center rounded-3xl bg-surface p-3 text-center shadow-sm shadow-black/5">
      <div className="text-xl font-bold text-ink">{value}</div>
      <div className="text-[10px] text-ink-soft">{label}</div>
    </div>
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
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: { kcal: number; protein: number; carbs: number; fat: number } | null
  caption: string
}) {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-3xl bg-surface p-2 text-center shadow-sm shadow-black/5">
      <ConcentricRings kcal={kcal} protein={protein} carbs={carbs} fat={fat} targets={targets} size="compact" />
      <div className="text-[10px] leading-tight text-ink-soft">{caption}</div>
    </div>
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
