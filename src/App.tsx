import { Suspense, lazy, useLayoutEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { SwipeNavigator } from './components/SwipeNavigator'
import { RecipesPage, StatsPage, SupplementsPage } from './components/SectionPreview'
import { AddMealContext } from './hooks/useAddMeal'
import { SwipeProgressProvider } from './lib/swipeProgress'
import { TopGradient } from './components/TopGradient'
import { BackgroundRings } from './components/BackgroundRings'
import { FeedPage } from './pages/FeedPage'
import { SettingsPage } from './pages/SettingsPage'
import { BodyProfilePage } from './pages/settings/BodyProfilePage'
import { ApiSettingsPage } from './pages/settings/ApiSettingsPage'
import { StorageSettingsPage } from './pages/settings/StorageSettingsPage'
import { DataSettingsPage } from './pages/settings/DataSettingsPage'
import { SyncSettingsPage } from './pages/settings/SyncSettingsPage'
import { AboutSettingsPage } from './pages/settings/AboutSettingsPage'
import { UpdateSettingsPage } from './pages/settings/UpdateSettingsPage'
import { QuotaSettingsPage } from './pages/settings/QuotaSettingsPage'
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

/**
 * Der Glas-Baukasten (src/lab/). Bewusst lazy und ohne Eintrag in der
 * Navigation: die Seite ist ein Labor zum Ausprobieren, kein Teil der App.
 * So landet weder ihr Code noch der WebGL-Shader im Haupt-Bundle.
 */
const GlassLab = lazy(lazyRetry(() => import('./lab/GlassLab').then((m) => ({ default: m.GlassLab }))))

const AppGlassLab = lazy(lazyRetry(() => import('./lab/AppGlassLab').then((m) => ({ default: m.AppGlassLab }))))

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
  * .glass-accent buttons in — Rezepte/Supplements lighter than Feed's exact accent blue, Statistik
  * darker, per the uploaded blue-scale palette (index.css has the full reasoning). */
const SECTION_COLOR_VAR: Record<Section, string> = {
  feed: 'var(--color-section-feed)',
  recipes: 'var(--color-section-recipes)',
  supplements: 'var(--color-section-supplements)',
  stats: 'var(--color-section-stats)',
}

/** Same idea as SECTION_COLOR_VAR, for .text-section's icon glyphs (PageHeader's gear/"+",
  * SupplementsPage's category pill) — Statistik has no dedicated -icon token (index.css explains
  * why: its own value already reads fine as a glyph color), so it reuses its section color directly. */
const SECTION_ICON_VAR: Record<Section, string> = {
  feed: 'var(--color-section-feed-icon)',
  recipes: 'var(--color-section-recipes-icon)',
  supplements: 'var(--color-section-supplements-icon)',
  stats: 'var(--color-section-stats)',
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
      document.body.style.setProperty('--color-section-icon', SECTION_ICON_VAR[section])
    } else {
      document.body.style.removeProperty('--color-section')
      document.body.style.removeProperty('--color-section-icon')
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
      <BackgroundRings />
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
            <Route
              path="/lab"
              element={
                <Suspense fallback={<p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>}>
                  <GlassLab />
                </Suspense>
              }
            />
            <Route
              path="/lab/app"
              element={
                <Suspense fallback={<p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>}>
                  <AppGlassLab />
                </Suspense>
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/koerperwerte" element={<BodyProfilePage />} />
            <Route path="/settings/api" element={<ApiSettingsPage />} />
            <Route path="/settings/speicher" element={<StorageSettingsPage />} />
            <Route path="/settings/daten" element={<DataSettingsPage />} />
            <Route path="/settings/sync" element={<SyncSettingsPage />} />
            <Route path="/settings/kontingent" element={<QuotaSettingsPage />} />
            <Route path="/settings/aktualisierung" element={<UpdateSettingsPage />} />
            <Route path="/settings/version" element={<AboutSettingsPage />} />
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
