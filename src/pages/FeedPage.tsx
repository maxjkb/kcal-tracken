import { useState } from 'react'
import { useMealsForDate } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal, type MealType } from '../lib/db'
import { MealCard } from '../components/MealCard'
import { MealEditor } from '../components/MealEditor'
import { MealDetail } from '../components/MealDetail'
import { ChevronIcon } from '../components/ChevronIcon'
import { MacroIcon, type MacroType } from '../components/MacroIcon'
import { computeDailyTargets, getBodyProfile, percentOfTarget } from '../lib/bodyProfile'

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

/** A reasonable default meal type based on the time of day, for the single "Hinzufügen" tile. */
function guessMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 18) return 'snack'
  return 'dinner'
}

export function FeedPage() {
  const [dateKey, setDateKey] = useState(() => toLocalDateKey(new Date()))
  const meals = useMealsForDate(dateKey)
  const [editorState, setEditorState] = useState<
    { mode: 'closed' } | { mode: 'create'; mealType?: MealType } | { mode: 'edit'; meal: Meal } | { mode: 'view'; meal: Meal }
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
    <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-2 shadow-sm shadow-black/5">
        <button
          onClick={() => setDateKey((k) => addDays(k, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink"
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink"
          aria-label="Nächster Tag"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="mb-6 rounded-3xl bg-surface p-5 text-center shadow-sm shadow-black/5">
        <div className="flex justify-center">
          <div className="rounded-full bg-kcal/15 px-9 py-4 text-center">
            <div className="text-4xl font-bold tracking-tight text-ink">{Math.round(totals.kcal)}</div>
            <div className="text-xs font-medium text-ink-soft">
              Kalorien{targets && ` · ${percentOfTarget(totals.kcal, targets.kcal)}%`}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <SummaryMacroBadge type="protein" label="Protein" value={totals.protein} target={targets?.protein} />
          <SummaryMacroBadge type="carbs" label="Kohlenhydrate" value={totals.carbs} target={targets?.carbs} />
          <SummaryMacroBadge type="fat" label="Fett" value={totals.fat} target={targets?.fat} />
        </div>
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

          <button
            onClick={() => setEditorState({ mode: 'create', mealType: guessMealType() })}
            className="flex items-center justify-center gap-2 rounded-3xl bg-accent py-4 text-base font-semibold text-ink"
          >
            <PlusIcon className="h-5 w-5" />
            Hinzufügen
          </button>
        </div>
      )}

      {editorState.mode === 'view' && (
        <MealDetail
          meal={editorState.meal}
          onClose={() => setEditorState({ mode: 'closed' })}
          onEdit={() => setEditorState({ mode: 'edit', meal: editorState.meal })}
        />
      )}

      {(editorState.mode === 'create' || editorState.mode === 'edit') && (
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

const SUMMARY_BADGE_BG: Record<MacroType, string> = {
  protein: 'bg-protein/15',
  carbs: 'bg-carbs/15',
  fat: 'bg-fat/15',
}

function SummaryMacroBadge({
  type,
  label,
  value,
  target,
}: {
  type: MacroType
  label: string
  value: number
  target?: number
}) {
  const pct = target ? percentOfTarget(value, target) : null
  return (
    <div className={`rounded-full px-3 py-1.5 text-center ${SUMMARY_BADGE_BG[type]}`}>
      <div className="text-sm font-bold text-ink">{Math.round(value)}g</div>
      <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-ink-soft">
        <MacroIcon type={type} className="h-2.5 w-2.5" />
        {label}
        {pct !== null && ` · ${pct}%`}
      </div>
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className={className}>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}
