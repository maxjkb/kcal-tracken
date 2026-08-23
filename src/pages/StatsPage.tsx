import { useState } from 'react'
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
import { MacroBadge } from '../components/MacroBadge'
import { ChevronIcon } from '../components/ChevronIcon'
import {
  bucketByDay,
  bucketByMonth,
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
  const avgKcalPerMeal = mealCount > 0 ? totals.kcal / mealCount : 0
  const dailyAverage = computeDailyAverage(startKey, endKey, totals.kcal)
  const macroAverages = computeDailyMacroAverages(startKey, endKey, totals)

  const dayData = period === 'week' || period === 'month' ? bucketByDay(startKey, endKey, kcalByDate) : []
  const monthData = period === 'year' ? bucketByMonth(Number(anchorKey.slice(0, 4)), kcalByDate) : []
  const perMealData =
    period === 'day'
      ? [...(meals ?? [])]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((m) => ({ key: m.id, label: MEAL_TYPE_LABELS[m.mealType], kcal: m.nutrition.kcal }))
      : []

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
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

      <div className="mb-4 flex gap-1.5 rounded-full bg-surface p-1.5 shadow-sm shadow-black/5">
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

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-2 shadow-sm shadow-black/5">
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink"
          aria-label="Vorheriger Zeitraum"
        >
          <ChevronIcon direction="left" />
        </button>
        <span className="text-sm font-medium text-ink">{formatPeriodLabel(period, anchorKey)}</span>
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink"
          aria-label="Nächster Zeitraum"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatTile value={Math.round(totals.kcal).toLocaleString('de-DE')} label="kcal gesamt" />
        {period === 'day' ? (
          <StatTile value={Math.round(avgKcalPerMeal).toLocaleString('de-DE')} label="Ø kcal / Mahlzeit" />
        ) : (
          <StatTile value={Math.round(dailyAverage).toLocaleString('de-DE')} label="Ø kcal / Tag" />
        )}
        <MacroTile
          heading={period === 'day' ? 'Nährwerte' : 'Ø Nährwerte/Tag'}
          protein={period === 'day' ? totals.protein : macroAverages.protein}
          carbs={period === 'day' ? totals.carbs : macroAverages.carbs}
          fat={period === 'day' ? totals.fat : macroAverages.fat}
        />
      </div>

      <div className="rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        {(period === 'week' || period === 'month') && meals !== undefined && dayData.length > 0 && (
          <div className="mb-2 text-xs font-semibold text-ink-soft">{monthHeadingLabel(startKey, endKey)}</div>
        )}
        <div className="h-56">
          {meals === undefined ? (
            <p className="flex h-full items-center justify-center text-sm text-ink-soft">Lädt…</p>
          ) : period === 'day' ? (
            perMealData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-ink-soft">
                Keine Mahlzeiten an diesem Tag.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perMealData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
                  <XAxis dataKey="label" stroke="#6e6e73" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12 }}
                    labelStyle={{ color: '#1d1d1f' }}
                    formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Kalorien']}
                  />
                  <Bar dataKey="kcal" fill="#34c759" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : period === 'year' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
                <XAxis dataKey="label" stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12 }}
                  labelStyle={{ color: '#1d1d1f' }}
                  formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Gesamt']}
                />
                <Line type="monotone" dataKey="kcal" stroke="#34c759" strokeWidth={2.5} dot={{ r: 3, fill: '#34c759' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#6e6e73"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={period === 'month' ? 3 : 0}
                />
                <YAxis stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12 }}
                  labelStyle={{ color: '#1d1d1f' }}
                  formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Kalorien']}
                />
                <Bar dataKey="kcal" fill="#34c759" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
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

function MacroTile({
  heading,
  protein,
  carbs,
  fat,
}: {
  heading: string
  protein: number
  carbs: number
  fat: number
}) {
  return (
    <div className="flex h-24 flex-col items-center justify-center rounded-3xl bg-surface p-3 text-center shadow-sm shadow-black/5">
      <div className="flex flex-col items-center gap-1">
        <MacroBadge type="protein" value={protein} size="sm" />
        <MacroBadge type="carbs" value={carbs} size="sm" />
        <MacroBadge type="fat" value={fat} size="sm" />
      </div>
      <div className="mt-1 text-[10px] text-ink-soft">{heading}</div>
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
