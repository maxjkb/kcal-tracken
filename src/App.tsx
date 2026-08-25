import { Suspense, lazy, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { TopGradient } from './components/TopGradient'
import { FeedPage } from './pages/FeedPage'
import { SettingsPage } from './pages/SettingsPage'
import { BodyProfilePage } from './pages/settings/BodyProfilePage'
import { ApiSettingsPage } from './pages/settings/ApiSettingsPage'
import { StorageSettingsPage } from './pages/settings/StorageSettingsPage'
import { DataSettingsPage } from './pages/settings/DataSettingsPage'
import { SyncSettingsPage } from './pages/settings/SyncSettingsPage'
import { MealEditor } from './components/MealEditor'
import { lazyRetry } from './lib/lazyRetry'
import { toLocalDateKey } from './lib/db'
import { guessMealType } from './lib/mealTypeGuess'

const StatsPage = lazy(lazyRetry(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage }))))
const RecipesPage = lazy(lazyRetry(() => import('./pages/RecipesPage').then((m) => ({ default: m.RecipesPage }))))
const SupplementsPage = lazy(
  lazyRetry(() => import('./pages/SupplementsPage').then((m) => ({ default: m.SupplementsPage }))),
)
const RecipeCategoryPage = lazy(
  lazyRetry(() => import('./pages/RecipeCategoryPage').then((m) => ({ default: m.RecipeCategoryPage }))),
)
const RecipeDetailPage = lazy(
  lazyRetry(() => import('./pages/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage }))),
)

const recipesFallback = <p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>

// Only the four main-page roots get the decorative top gradient — not their
// sub-pages (recipe category/detail, settings, …).
const TOP_GRADIENT_PATHS = ['/', '/recipes', '/supplements', '/stats']

export default function App() {
  const [addingMeal, setAddingMeal] = useState(false)
  const location = useLocation()

  return (
    <>
      {/* Rendered outside the min-h-screen wrapper below, and that wrapper's
          own explicit bg-bg is dropped in favor of body's identical
          background (see index.css) — an opaque sibling paints over a
          negative-z-index fixed element regardless of z-index, since that's
          a later, non-positioned paint step that simply covers whatever's
          behind it; body's own canvas-level background doesn't have that
          problem, it's always the bottom-most layer. */}
      {TOP_GRADIENT_PATHS.includes(location.pathname) && <TopGradient />}
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route
            path="/stats"
            element={
              <Suspense fallback={<p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>}>
                <StatsPage />
              </Suspense>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/koerperwerte" element={<BodyProfilePage />} />
          <Route path="/settings/api" element={<ApiSettingsPage />} />
          <Route path="/settings/speicher" element={<StorageSettingsPage />} />
          <Route path="/settings/daten" element={<DataSettingsPage />} />
          <Route path="/settings/sync" element={<SyncSettingsPage />} />
          <Route
            path="/recipes"
            element={
              <Suspense fallback={recipesFallback}>
                <RecipesPage />
              </Suspense>
            }
          />
          <Route
            path="/recipes/:category"
            element={
              <Suspense fallback={recipesFallback}>
                <RecipeCategoryPage />
              </Suspense>
            }
          />
          <Route
            path="/recipes/:category/:id"
            element={
              <Suspense fallback={recipesFallback}>
                <RecipeDetailPage />
              </Suspense>
            }
          />
          <Route
            path="/supplements"
            element={
              <Suspense fallback={<p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>}>
                <SupplementsPage />
              </Suspense>
            }
          />
        </Routes>
        <BottomNav onAddMeal={() => setAddingMeal(true)} />

        {addingMeal && (
          <MealEditor
            date={toLocalDateKey(new Date())}
            defaultMealType={guessMealType()}
            onClose={() => setAddingMeal(false)}
          />
        )}
      </div>
    </>
  )
}
