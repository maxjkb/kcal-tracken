import { Suspense, lazy, useLayoutEffect, useRef, useState } from 'react'
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
import { GlassStage } from './glass/GlassStage'
import type { LightState } from './glass/useLightSource'

const RecipeCategoryPage = lazy(
  lazyRetry(() => import('./pages/RecipeCategoryPage').then((m) => ({ default: m.RecipeCategoryPage }))),
)
const RecipeDetailPage = lazy(
  lazyRetry(() => import('./pages/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage }))),
)
const SuppScorePage = lazy(lazyRetry(() => import('./pages/SuppScorePage').then((m) => ({ default: m.SuppScorePage }))))

/**
 * Der Glas-Baukasten (src/lab/) — der reine Material-Vergleich (CSS/SVG/
 * WebGL nebeneinander), nicht die App selbst. Bewusst lazy und ohne Eintrag
 * in der Navigation: eine Seite zum Ausprobieren, kein Teil der App. Die
 * Bausteine, die die App tatsächlich verwendet (src/glass/), sind davon
 * unabhängig und liegen NICHT unter src/lab/.
 */
const GlassLab = lazy(lazyRetry(() => import('./lab/GlassLab').then((m) => ({ default: m.GlassLab }))))

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
  // A static stand-in, not useLightSource(): that hook runs its own
  // pointer/device-orientation tracking loop purely to feed GlassStage's
  // light uniform, which is now disabled below and never reads it. Kept as
  // an inert ref only to satisfy GlassStage's prop type — no tracking loop
  // means no wasted work. useLightSource() itself is untouched; /lab's own
  // pages still use it live for the WebGL/CSS/SVG comparison.
  const lightRef = useRef<LightState>({ azimuth: 0, elevation: 0, x: 0, y: 0, z: 1 })

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
      {/* Disabled (was unconditionally on in v1.14.3): the WebGL layer tracks
          each flow-positioned card's position by reading getBoundingClientRect()
          once per requestAnimationFrame and redrawing the canvas there — but
          native scroll is driven by the browser's compositor thread, which
          can already be several pixels further along than whatever position
          the main thread last read by the time that frame actually paints.
          That gap is the "lags behind and drifts during scroll" the WebGL
          glass visibly showed under real use — architectural, not a bug in
          this call site, and not something a canvas overlay tracking DOM
          scroll from the main thread can fully close. CSS backdrop-filter
          glass doesn't have this problem: it composites in the same native
          layer that scrolls, with no separate read-and-redraw step to lag
          behind. `enabled={false}` here is the whole revert — GlassStage
          itself already treats "disabled" identically to "WebGL2 missing":
          it removes .glass-gl-active and steps back, and every .gl-surface
          simply renders its original CSS material again, unchanged. The
          GlassStage/GlassSurface machinery and the /lab prototype are left
          in place rather than deleted, in case this is revisited. */}
      <GlassStage lightRef={lightRef} enabled={false} />
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
            <Route
              path="/supplements/score"
              element={
                <Suspense fallback={<p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>}>
                  <SuppScorePage />
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
