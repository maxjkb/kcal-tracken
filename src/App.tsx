import { Suspense, lazy, useLayoutEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { SwipeNavigator } from './components/SwipeNavigator'
import { RecipesPage, StatsPage, SupplementsPage } from './components/SectionPreview'
import { AddMealContext } from './hooks/useAddMeal'
import { SwipeProgressProvider } from './lib/swipeProgress'
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

const RecipeCategoryPage = lazy(
  lazyRetry(() => import('./pages/RecipeCategoryPage').then((m) => ({ default: m.RecipeCategoryPage }))),
)
const RecipeDetailPage = lazy(
  lazyRetry(() => import('./pages/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage }))),
)

const recipesFallback = <p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>

type Section = 'feed' | 'recipes' | 'supplements' | 'stats'

/** Which of the four main areas a route belongs to — covers the whole area, not just its root
  * (a recipe's detail page still counts as "Rezepte"), so the theme stays consistent while
  * navigating deeper in. Settings and anything else outside these four falls through to null. */
function sectionForPath(pathname: string): Section | null {
  if (pathname === '/') return 'feed'
  if (pathname.startsWith('/recipes')) return 'recipes'
  if (pathname.startsWith('/supplements')) return 'supplements'
  if (pathname.startsWith('/stats')) return 'stats'
  return null
}

/** The --color-section-* custom property (see index.css) each area washes its TopGradient and
  * .glass-accent buttons in. Statistik deliberately stays on the plain accent blue — see index.css
  * for why — rather than getting its own token. */
const SECTION_COLOR_VAR: Record<Section, string> = {
  feed: 'var(--color-section-feed)',
  recipes: 'var(--color-section-recipes)',
  supplements: 'var(--color-section-supplements)',
  stats: 'var(--color-accent)',
}

export default function App() {
  const [addingMeal, setAddingMeal] = useState(false)
  const location = useLocation()
  const section = sectionForPath(location.pathname)

  // Set on <body> rather than a wrapping element: Sheets (MealEditor, RecipeEditor, the date
  // pickers, …) portal straight to document.body, outside this component's own DOM subtree, so a
  // custom property set anywhere inside here wouldn't reach them — body is the one ancestor every
  // portaled Sheet actually shares. useLayoutEffect (not useEffect) so the new area's color is
  // already in place before the browser paints the route change, no one-frame flash of the old one.
  useLayoutEffect(() => {
    if (section) {
      document.body.style.setProperty('--color-section', SECTION_COLOR_VAR[section])
    } else {
      document.body.style.removeProperty('--color-section')
    }
  }, [section])

  return (
    <AddMealContext.Provider value={() => setAddingMeal(true)}>
      <SwipeProgressProvider>
      {/* Rendered outside the min-h-screen wrapper below, and that wrapper's
          own explicit bg-bg is dropped in favor of body's identical
          background (see index.css) — an opaque sibling paints over a
          negative-z-index fixed element regardless of z-index, since that's
          a later, non-positioned paint step that simply covers whatever's
          behind it; body's own canvas-level background doesn't have that
          problem, it's always the bottom-most layer. */}
      {section && <TopGradient />}
      <div className="min-h-screen">
        <SwipeNavigator>
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
        </SwipeNavigator>
        <BottomNav />

        {addingMeal && (
          <MealEditor
            date={toLocalDateKey(new Date())}
            defaultMealType={guessMealType()}
            onClose={() => setAddingMeal(false)}
          />
        )}
      </div>
      </SwipeProgressProvider>
    </AddMealContext.Provider>
  )
}
