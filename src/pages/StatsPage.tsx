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
import { toLocalDateKey, type Meal } from '../lib/db'
import {
  bucketByDay,
  bucketByMonth,
  computeDailyAverage,
  formatPeriodLabel,
  getPeriodRange,
  shiftAnchor,
  type Period,
} from '../lib/stats'

const PERIODS: { key: Period; label: string }[] = [
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

  async function handleExportPdf(meals: Meal[]) {
    setExporting(true)
    try {
      const { exportDiaryPdf } = await import('../lib/pdf')
      exportDiaryPdf({ period, anchorKey, meals, startKey, endKey })
    } finally {
      setExporting(false)
    }
  }

  const kcalByDate = new Map<string, number>()
  let totalKcal = 0
  for (const m of meals ?? []) {
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + m.nutrition.kcal)
    totalKcal += m.nutrition.kcal
  }

  const dailyAverage = computeDailyAverage(startKey, endKey, totalKcal)

  const dayData = period !== 'year' ? bucketByDay(startKey, endKey, kcalByDate) : []
  const monthData = period === 'year' ? bucketByMonth(Number(anchorKey.slice(0, 4)), kcalByDate) : []

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Statistik</h1>
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
              period === key ? 'bg-kcal/20 text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, -1))}
          className="rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
          aria-label="Vorheriger Zeitraum"
        >
          ‹
        </button>
        <span className="text-sm text-ink">{formatPeriodLabel(period, anchorKey)}</span>
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, 1))}
          className="rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
          aria-label="Nächster Zeitraum"
        >
          ›
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-surface p-4 text-center shadow-sm shadow-black/5">
          <div className="text-2xl font-bold text-ink">{Math.round(totalKcal).toLocaleString('de-DE')}</div>
          <div className="text-xs text-ink-soft">kcal gesamt</div>
        </div>
        <div className="rounded-3xl bg-surface p-4 text-center shadow-sm shadow-black/5">
          <div className="text-2xl font-bold text-ink">{Math.round(dailyAverage).toLocaleString('de-DE')}</div>
          <div className="text-xs text-ink-soft">Ø kcal / Tag</div>
        </div>
      </div>

      <div className="h-64 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        {meals === undefined ? (
          <p className="flex h-full items-center justify-center text-sm text-ink-soft">Lädt…</p>
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
              <Line type="monotone" dataKey="kcal" stroke="#ff9500" strokeWidth={2.5} dot={{ r: 3, fill: '#ff9500' }} />
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
                interval={period === 'month' ? 4 : 0}
              />
              <YAxis stroke="#6e6e73" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e5e5ea', borderRadius: 12 }}
                labelStyle={{ color: '#1d1d1f' }}
                formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Kalorien']}
              />
              <Bar dataKey="kcal" fill="#ff9500" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
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
