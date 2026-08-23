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
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setDateKey((k) => addDays(k, -1))}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          aria-label="Vorheriger Tag"
        >
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-100">{formatDateHeading(dateKey)}</h1>
          {!isToday && (
            <button
              onClick={() => setDateKey(toLocalDateKey(new Date()))}
              className="text-xs text-emerald-400 hover:underline"
            >
              Zu heute springen
            </button>
          )}
        </div>
        <button
          onClick={() => setDateKey((k) => addDays(k, 1))}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          aria-label="Nächster Tag"
        >
          ›
        </button>
      </div>

      <div className="mb-6 rounded-2xl bg-slate-900 p-4 text-center">
        <div className="text-3xl font-bold text-emerald-400">{Math.round(totals.kcal)}</div>
        <div className="text-xs text-slate-500">kcal an diesem Tag</div>
        <div className="mt-3 flex justify-center gap-4 text-xs text-slate-400">
          <span>Protein {Math.round(totals.protein)}g</span>
          <span>Kohlenhydrate {Math.round(totals.carbs)}g</span>
          <span>Fett {Math.round(totals.fat)}g</span>
        </div>
      </div>

      {meals === undefined ? (
        <p className="text-center text-sm text-slate-500">Lädt…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {MEAL_TYPE_ORDER.map((type) => (
            <section key={type}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">{MEAL_TYPE_LABELS[type]}</h2>
                <button
                  onClick={() => setEditorState({ mode: 'create', mealType: type })}
                  className="text-xs font-medium text-emerald-400 hover:underline"
                >
                  + Hinzufügen
                </button>
              </div>
              {mealsByType[type].length === 0 ? (
                <p className="text-xs text-slate-600">Noch nichts eingetragen.</p>
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
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 sm:right-[calc(50%-14rem)]"
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
