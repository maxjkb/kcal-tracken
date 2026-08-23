import { useState } from 'react'
import { useMealsForDate } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal, type MealType } from '../lib/db'
import { MealCard } from '../components/MealCard'
import { MealEditor } from '../components/MealEditor'

function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return toLocalDateKey(date)
}

function formatDateHeading(dateKey: string): string {
  const todayKey = toLocalDateKey(new Date())
  const yesterdayKey = addDays(todayKey, -1)
  if (dateKey === todayKey) return 'Heute'
  if (dateKey === yesterdayKey) return 'Gestern'
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

export function FeedPage() {
  const [dateKey, setDateKey] = useState(() => toLocalDateKey(new Date()))
  const meals = useMealsForDate(dateKey)
  const [editorState, setEditorState] = useState<
    { mode: 'closed' } | { mode: 'create'; mealType?: MealType } | { mode: 'edit'; meal: Meal }
  >({ mode: 'closed' })

  const isToday = dateKey === toLocalDateKey(new Date())
  const totals = (meals ?? []).reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.nutrition.kcal,
      protein: acc.protein + m.nutrition.protein,
      carbs: acc.carbs + m.nutrition.carbs,
      fat: acc.fat + m.nutrition.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  const mealsByType = (meals ?? []).reduce<Record<MealType, Meal[]>>(
    (acc, m) => {
      acc[m.mealType].push(m)
      return acc
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] },
  )

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setDateKey((k) => addDays(k, -1))}
          className="rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
          aria-label="Vorheriger Tag"
        >
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">{formatDateHeading(dateKey)}</h1>
          {!isToday && (
            <button
              onClick={() => setDateKey(toLocalDateKey(new Date()))}
              className="text-xs font-medium text-kcal hover:underline"
            >
              Zu heute springen
            </button>
          )}
        </div>
        <button
          onClick={() => setDateKey((k) => addDays(k, 1))}
          className="rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
          aria-label="Nächster Tag"
        >
          ›
        </button>
      </div>

      <div className="mb-6 rounded-3xl bg-surface p-5 text-center shadow-sm shadow-black/5">
        <div className="text-4xl font-bold tracking-tight text-ink">{Math.round(totals.kcal)}</div>
        <div className="text-xs text-ink-soft">kcal an diesem Tag</div>
        <div className="mt-4 flex justify-center gap-2">
          <MacroBadge color="protein" label="Protein" value={totals.protein} />
          <MacroBadge color="carbs" label="Kohlenhydrate" value={totals.carbs} />
          <MacroBadge color="fat" label="Fett" value={totals.fat} />
        </div>
      </div>

      {meals === undefined ? (
        <p className="text-center text-sm text-ink-soft">Lädt…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {MEAL_TYPE_ORDER.map((type) => (
            <section key={type}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{MEAL_TYPE_LABELS[type]}</h2>
                <button
                  onClick={() => setEditorState({ mode: 'create', mealType: type })}
                  className="rounded-full bg-kcal/15 px-3 py-1 text-xs font-semibold text-ink hover:bg-kcal/25"
                >
                  + Hinzufügen
                </button>
              </div>
              {mealsByType[type].length === 0 ? (
                <p className="text-xs text-ink-faint">Noch nichts eingetragen.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {mealsByType[type].map((meal) => (
                    <MealCard key={meal.id} meal={meal} onEdit={() => setEditorState({ mode: 'edit', meal })} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <button
        onClick={() => setEditorState({ mode: 'create' })}
        className="glass-accent fixed bottom-24 right-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-medium sm:right-[calc(50%-14rem)]"
        aria-label="Mahlzeit hinzufügen"
      >
        +
      </button>

      {editorState.mode !== 'closed' && (
        <MealEditor
          date={dateKey}
          initial={editorState.mode === 'edit' ? editorState.meal : undefined}
          defaultMealType={editorState.mode === 'create' ? editorState.mealType : undefined}
          onClose={() => setEditorState({ mode: 'closed' })}
        />
      )}
    </div>
  )
}

const MACRO_BADGE_BG: Record<'protein' | 'carbs' | 'fat', string> = {
  protein: 'bg-protein/15',
  carbs: 'bg-carbs/15',
  fat: 'bg-fat/15',
}

function MacroBadge({ color, label, value }: { color: 'protein' | 'carbs' | 'fat'; label: string; value: number }) {
  return (
    <div className={`rounded-full px-3 py-1.5 text-center ${MACRO_BADGE_BG[color]}`}>
      <div className="text-sm font-bold text-ink">{Math.round(value)}g</div>
      <div className="text-[10px] font-medium text-ink-soft">{label}</div>
    </div>
  )
}
