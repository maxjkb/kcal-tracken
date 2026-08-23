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
import { toLocalDateKey } from '../lib/db'
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
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Statistik</h1>

      <div className="mb-4 flex gap-1.5 rounded-xl bg-slate-900 p-1">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              period === key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, -1))}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          aria-label="Vorheriger Zeitraum"
        >
          ‹
        </button>
        <span className="text-sm text-slate-300">{formatPeriodLabel(period, anchorKey)}</span>
        <button
          onClick={() => setAnchorKey((k) => shiftAnchor(period, k, 1))}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          aria-label="Nächster Zeitraum"
        >
          ›
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-900 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{Math.round(totalKcal).toLocaleString('de-DE')}</div>
          <div className="text-xs text-slate-500">kcal gesamt</div>
        </div>
        <div className="rounded-2xl bg-slate-900 p-4 text-center">
          <div className="text-2xl font-bold text-slate-100">{Math.round(dailyAverage).toLocaleString('de-DE')}</div>
          <div className="text-xs text-slate-500">Ø kcal / Tag</div>
        </div>
      </div>

      <div className="h-64 rounded-2xl bg-slate-900 p-4">
        {meals === undefined ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">Lädt…</p>
        ) : period === 'year' ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Gesamt']}
              />
              <Line type="monotone" dataKey="kcal" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={period === 'month' ? 4 : 0}
              />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(v) => [`${Math.round(Number(v))} kcal`, 'Kalorien']}
              />
              <Bar dataKey="kcal" fill="#4ade80" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
