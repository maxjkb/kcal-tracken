import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { SwipeNavigator } from './components/SwipeNavigator'
import { RecipesPage, StatsPage, SupplementsPage } from './components/SectionPreview'
import { AddMealContext } from './hooks/useAddMeal'
import { SwipeProgressProvider } from './lib/swipeProgress'
import { preloadSection, registerSectionLoaders } from './lib/preloadSection'
import { AmbientBackground } from './components/AmbientBackground'
import { BackgroundRings } from './components/BackgroundRings'
import { FeedPage } from './pages/FeedPage'
import { SettingsSheet } from './components/SettingsSheet'
import { SettingsSheetContext } from './hooks/useSettingsSheet'
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

const loadRecipeCategory = () => import('./pages/RecipeCategoryPage').then((m) => ({ default: m.RecipeCategoryPage }))
const loadRecipeDetail = () => import('./pages/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage }))

const RecipeCategoryPage = lazy(lazyRetry(loadRecipeCategory))
const RecipeDetailPage = lazy(lazyRetry(loadRecipeDetail))

// The same reasoning as preloadSection's, one level deeper: standing on the
// Rezepte list, the only places to go are a category and then a recipe. A
// measured tap on a category fetched both its chunk and SlideInPage's *during*
// the slide-in — the panel slid in empty for a third of a second on a throttled
// connection, which is precisely the "interrupted by loading" the transitions
// rework is about. Fetched while the user is still reading the list instead,
// the tap has nothing left to wait for.
registerSectionLoaders({
  '/recipes/:category': loadRecipeCategory,
  '/recipes/:category/:id': loadRecipeDetail,
})

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

/** The --color-section-* custom property (see index.css) each area washes its AmbientBackground and
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
  const navigate = useNavigate()
  // Not component state: the Einstellungen sheet opens full pages from inside
  // itself (Körperwerte, API, Sync …), and a boolean can't survive that route
  // change — going back landed on the bare page with the sheet gone, several
  // steps further back than "back" should mean. As a search param it is a
  // history entry of its own: open pushes it, tapping a category pushes the
  // page on top, and back returns to the sheet exactly as it was. Sheets that
  // never open a page keep their own marker entry instead (see Sheet.tsx).
  const settingsOpen = new URLSearchParams(location.search).get('sheet') === 'settings'
  // Latched on by the route, cleared by the sheet once it has finished
  // sliding out — so the sheet outlives the search param by exactly its own
  // exit animation. Set during render rather than from an effect (React's
  // "adjusting state when a prop changes"): an effect would commit the
  // param change first and only then mount the sheet, costing a frame on
  // every open.
  const [settingsMounted, setSettingsMounted] = useState(false)
  if (settingsOpen && !settingsMounted) setSettingsMounted(true)
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

  // Standing in Rezepte, the only way deeper is a category and then a recipe.
  // Fetching both chunks while the list is still being read costs nothing the
  // user can feel; fetching them on the tap costs the whole slide-in.
  // requestIdleCallback so it never competes with the route change that just
  // brought us here (Safari has no such thing — a timeout is close enough for
  // work with no deadline).
  useEffect(() => {
    if (section !== 'recipes') return
    const warm = () => {
      preloadSection('/recipes/:category')
      preloadSection('/recipes/:category/:id')
    }
    const ric = window.requestIdleCallback
    if (ric) {
      const id = ric(warm, { timeout: 1500 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 400)
    return () => window.clearTimeout(id)
  }, [section])

  return (
    <AddMealContext.Provider value={() => setAddingMeal(true)}>
    <SettingsSheetContext.Provider value={() => navigate({ search: '?sheet=settings' })}>
      <SwipeProgressProvider>
      {/* Rendered outside the min-h-screen wrapper below, and that wrapper's
          own explicit bg-bg is dropped in favor of body's identical
          background (see index.css) — an opaque sibling paints over a
          negative-z-index fixed element regardless of z-index, since that's
          a later, non-positioned paint step that simply covers whatever's
          behind it; body's own canvas-level background doesn't have that
          problem, it's always the bottom-most layer. */}
      <BackgroundRings />
      {/* Big-Number-Redesign point 5: unconditional (TopGradient only ever
          rendered inside the four main areas) — a Sheet portalled to
          document.body from Einstellungen or anywhere else now also has
          colour behind it to blur, not just Feed/Rezepte/Supplements/
          Statistik. Still area-aware where an area exists: --color-section
          falls back to --color-accent outside the four main routes (see
          body{} in index.css), so this reads as plain accent-blue there. */}
      <AmbientBackground />
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
        {/* Kept mounted across the search param going away, so the sheet
            gets to slide out before it leaves the tree; `dismiss` starts that
            slide and the unmount happens on the sheet's own onClose. The
            branch inside it separates the two ways out: the route already
            changed (back gesture — nothing left to pop), or the sheet
            dismissed itself (grip, backdrop), in which case its history entry
            still has to come off. */}
        {settingsMounted && (
          <SettingsSheet
            dismiss={!settingsOpen}
            onClose={() => {
              setSettingsMounted(false)
              if (settingsOpen) navigate(-1)
            }}
          />
        )}
      </div>
      </SwipeProgressProvider>
    </SettingsSheetContext.Provider>
    </AddMealContext.Provider>
  )
}
