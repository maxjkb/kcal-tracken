import { useState } from 'react'
import { useMealsForDate } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal, type MealType } from '../lib/db'
import { MealCard } from '../components/MealCard'
import { MealEditor } from '../components/MealEditor'
import { MealDetail } from '../components/MealDetail'
import { ChevronIcon } from '../components/ChevronIcon'
import { NutrientRings } from '../components/NutrientRings'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'

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
    { mode: 'closed' } | { mode: 'edit'; meal: Meal } | { mode: 'view'; meal: Meal }
  >({ mode: 'closed' })
  const [collapsed, setCollapsed] = useState<Record<MealType, boolean>>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snack: false,
  })

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

  const bodyProfile = getBodyProfile()
  const targets = bodyProfile ? computeDailyTargets(bodyProfile) : null

  const mealsByType = (meals ?? []).reduce<Record<MealType, Meal[]>>(
    (acc, m) => {
      acc[m.mealType].push(m)
      return acc
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] },
  )

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="glass-subtle mb-4 flex items-center justify-between rounded-2xl px-2 py-2 shadow-sm shadow-black/5">
        <button
          onClick={() => setDateKey((k) => addDays(k, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
          aria-label="Vorheriger Tag"
        >
          <ChevronIcon direction="left" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">{formatDateHeading(dateKey)}</h1>
          {!isToday && (
            <button
              onClick={() => setDateKey(toLocalDateKey(new Date()))}
              className="text-xs font-medium text-accent hover:underline"
            >
              Zu heute springen
            </button>
          )}
        </div>
        <button
          onClick={() => setDateKey((k) => addDays(k, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
          aria-label="Nächster Tag"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="glass-subtle mb-6 rounded-3xl p-5 shadow-sm shadow-black/5">
        <NutrientRings kcal={totals.kcal} protein={totals.protein} carbs={totals.carbs} fat={totals.fat} targets={targets} />
      </div>

      {meals === undefined ? (
        <p className="text-center text-sm text-ink-soft">Lädt…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {MEAL_TYPE_ORDER.map((type) => {
            const typeMeals = mealsByType[type]
            const isOpen = !collapsed[type]
            return (
              <section key={type}>
                <div className="mb-2 flex items-center gap-1.5">
                  <h2 className="text-lg font-semibold text-ink">{MEAL_TYPE_LABELS[type]}</h2>
                  {typeMeals.length > 0 && (
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [type]: !c[type] }))}
                      aria-label={isOpen ? `${MEAL_TYPE_LABELS[type]} einklappen` : `${MEAL_TYPE_LABELS[type]} ausklappen`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft hover:bg-bg"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                {isOpen && typeMeals.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {typeMeals.map((meal) => (
                      <MealCard key={meal.id} meal={meal} onView={() => setEditorState({ mode: 'view', meal })} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {editorState.mode === 'view' && (
        <MealDetail
          meal={editorState.meal}
          onClose={() => setEditorState({ mode: 'closed' })}
          onEdit={() => setEditorState({ mode: 'edit', meal: editorState.meal })}
        />
      )}

      {editorState.mode === 'edit' && (
        <MealEditor date={dateKey} initial={editorState.meal} onClose={() => setEditorState({ mode: 'closed' })} />
      )}
    </div>
  )
}
