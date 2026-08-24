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
import { useMealsInRange } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, toLocalDateKey, type Meal } from '../lib/db'
import { lazyRetry } from '../lib/lazyRetry'
import { ChevronIcon } from '../components/ChevronIcon'
import { ConcentricRings, NutrientRings } from '../components/NutrientRings'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
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

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'year', label: 'Jahr' },
]

export function StatsPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('week')
  const [anchorKey, setAnchorKey] = useState(() => toLocalDateKey(new Date()))
  const { startKey, endKey } = getPeriodRange(period, anchorKey)
  const meals = useMealsInRange(startKey, endKey)
  const [exporting, setExporting] = useState(false)

  const loadPdfModule = lazyRetry(() => import('../lib/pdf'))

  async function handleExportPdf(meals: Meal[]) {
    setExporting(true)
    try {
      const { exportDiaryPdf } = await loadPdfModule()
      exportDiaryPdf({ period, anchorKey, meals, startKey, endKey })
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Statistik</h1>
        <button
          onClick={() => meals && handleExportPdf(meals)}
          disabled={!meals || meals.length === 0 || exporting}
          className="flex items-center gap-1.5 rounded-full bg-kcal/15 px-3 py-1.5 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PdfIcon />
          {exporting ? 'Erstelle PDF…' : 'Als PDF exportieren'}
        </button>
      </div>

      <div className="glass-subtle mb-4 flex gap-1.5 rounded-full p-1.5 shadow-sm shadow-black/5">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              period === key ? 'bg-accent/20 text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="glass-subtle mb-4 flex items-center justify-between rounded-2xl px-2 py-2 shadow-sm shadow-black/5">
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
          aria-label="Vorheriger Zeitraum"
        >
          <ChevronIcon direction="left" />
        </button>
        <span className="text-sm font-medium text-ink">{formatPeriodLabel(period, anchorKey)}</span>
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
        <div className="glass-subtle rounded-3xl p-5 shadow-sm shadow-black/5">
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
