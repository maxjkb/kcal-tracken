import { Link } from 'react-router-dom'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from '../lib/db'
import { ChevronIcon } from '../components/ChevronIcon'
import { SlideInPage } from '../components/SlideInPage'
import { MealTypeIcon } from '../components/MealTypeIcon'

/** The Rezepte root — one row per meal-type category, matching the Einstellungen menu's list style. */
export function RecipesPage() {
  return (
    <SlideInPage>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-ink">Rezepte</h1>

        <div className="glass-subtle divide-y divide-line/60 overflow-hidden rounded-3xl shadow-sm shadow-black/5">
          {MEAL_TYPE_ORDER.map((type) => (
            <Link
              key={type}
              to={`/recipes/${type}`}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-bg/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <MealTypeIcon type={type} />
              </span>
              <span className="flex-1 text-sm font-medium text-ink">{MEAL_TYPE_LABELS[type]}</span>
              <ChevronIcon direction="right" className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          ))}
        </div>
      </div>
    </SlideInPage>
  )
}
