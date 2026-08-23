import { useState } from 'react'
import {
  ACTIVITY_LABELS,
  clearBodyProfile,
  computeDailyTargets,
  getBodyProfile,
  GOAL_LABELS,
  setBodyProfile,
  type ActivityLevel,
  type BodyProfile,
  type Goal,
  type Sex,
} from '../lib/bodyProfile'

const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active']
const GOALS: Goal[] = ['lose', 'maintain', 'gain']

const DEFAULT_PROFILE: BodyProfile = {
  sex: 'male',
  heightCm: 175,
  weightKg: 75,
  age: 30,
  activityLevel: 'moderate',
  goal: 'maintain',
  goalRateKcal: 500,
}

export function BodyProfileSection({ onSaved }: { onSaved: () => void }) {
  const existing = getBodyProfile()
  const [profile, setProfile] = useState<BodyProfile>(existing ?? DEFAULT_PROFILE)
  const [enabled, setEnabled] = useState(Boolean(existing))

  const targets = computeDailyTargets(profile)

  function update<K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
  }

  function handleSave() {
    setBodyProfile(profile)
    setEnabled(true)
    onSaved()
  }

  function handleClear() {
    clearBodyProfile()
    setEnabled(false)
    onSaved()
  }

  return (
    <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
      <h2 className="mb-1 text-sm font-semibold text-ink">Körperwerte & Tagesbedarf</h2>
      <p className="mb-3 text-xs text-ink-soft">
        Wird genutzt, um deinen täglichen Kalorien- und Makrobedarf zu berechnen (Mifflin-St-Jeor-Formel)
        — dieser erscheint dann als Prozentangabe neben deinen absoluten Werten im Feed und in der
        Statistik. Bleibt komplett lokal, wie alles andere auch.
      </p>

      <div className="flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-xs text-ink-soft">Geschlecht</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(['male', 'female'] as Sex[]).map((sex) => (
              <button
                key={sex}
                type="button"
                onClick={() => update('sex', sex)}
                className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                  profile.sex === sex ? 'bg-accent/20 text-ink' : 'bg-bg text-ink-soft hover:bg-line'
                }`}
              >
                {sex === 'male' ? 'Männlich' : 'Weiblich'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-soft">Größe (cm)</span>
            <input
              type="number"
              value={profile.heightCm}
              onChange={(e) => update('heightCm', Number(e.target.value) || 0)}
              className="rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-soft">Gewicht (kg)</span>
            <input
              type="number"
              value={profile.weightKg}
              onChange={(e) => update('weightKg', Number(e.target.value) || 0)}
              className="rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-soft">Alter</span>
            <input
              type="number"
              value={profile.age}
              onChange={(e) => update('age', Number(e.target.value) || 0)}
              className="rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">Aktivitätslevel</span>
          <select
            value={profile.activityLevel}
            onChange={(e) => update('activityLevel', e.target.value as ActivityLevel)}
            className="rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            {ACTIVITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {ACTIVITY_LABELS[level]}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1 block text-xs text-ink-soft">Ziel</span>
          <div className="grid grid-cols-3 gap-1.5">
            {GOALS.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => update('goal', goal)}
                className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                  profile.goal === goal ? 'bg-accent/20 text-ink' : 'bg-bg text-ink-soft hover:bg-line'
                }`}
              >
                {GOAL_LABELS[goal]}
              </button>
            ))}
          </div>
        </div>

        {profile.goal !== 'maintain' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-soft">
              Tägliches {profile.goal === 'lose' ? 'Defizit' : 'Überschuss'} (kcal)
            </span>
            <input
              type="number"
              value={profile.goalRateKcal}
              onChange={(e) => update('goalRateKcal', Number(e.target.value) || 0)}
              className="rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>
        )}

        <div className="rounded-2xl bg-bg p-3">
          <span className="mb-2 block text-xs font-semibold text-ink-soft">Berechneter Tagesbedarf</span>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div>
              <div className="text-sm font-bold text-ink">{targets.kcal}</div>
              <div className="text-[10px] text-ink-soft">kcal</div>
            </div>
            <div>
              <div className="text-sm font-bold text-ink">{targets.protein}g</div>
              <div className="text-[10px] text-ink-soft">Protein</div>
            </div>
            <div>
              <div className="text-sm font-bold text-ink">{targets.carbs}g</div>
              <div className="text-[10px] text-ink-soft">Kohlenh.</div>
            </div>
            <div>
              <div className="text-sm font-bold text-ink">{targets.fat}g</div>
              <div className="text-[10px] text-ink-soft">Fett</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="glass-accent flex-1 rounded-xl py-2.5 text-sm font-semibold"
          >
            Speichern
          </button>
          {enabled && (
            <button
              onClick={handleClear}
              className="rounded-xl bg-bg px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-line"
            >
              Entfernen
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
