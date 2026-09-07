import { Suspense, lazy, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { SwipeNavigator } from './components/SwipeNavigator'
import { RecipesPage, StatsPage, SupplementsPage } from './components/SectionPreview'
import { AddMealContext } from './hooks/useAddMeal'
import { CoachChatContext } from './hooks/useCoachChat'
import { CoachChatSheet } from './components/CoachChatSheet'
import { SwipeProgressProvider } from './lib/swipeProgress'
import { preloadSection, registerSectionLoaders } from './lib/preloadSection'
import { AmbientBackground } from './components/AmbientBackground'
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
import { useLightSource } from './glass/useLightSource'

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

export default function App() {
  const [addingMeal, setAddingMeal] = useState(false)
  const [coachChatOpen, setCoachChatOpen] = useState(false)
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
  // Round 2 (v2.2): GlassStage is back on (see its own mount below), scoped
  // to the few `webgl`-opted-in surfaces (GlassSurface.tsx) that don't have
  // the scroll-drift problem the original revert was about. Real pointer/
  // device-orientation tracking again, not the earlier inert stand-in —
  // `setContainer` goes on the same full-app wrapper /lab's own pages
  // attach it to, so the light follows a finger/pointer anywhere in the app.
  const { setContainer, lightRef } = useLightSource()

  // Rebrand (v2.0.0): this used to set --color-section/-icon on <body> to a
  // per-area blue-scale value on every route change (Sheets portal straight
  // to document.body, so that's where it had to live) — the "vier Blautöne"
  // mechanism explicit feedback named as part of why the app still read as
  // the old one. Retired along with --color-section-* itself in index.css;
  // that token now just always equals --color-accent (see body{} there), so
  // no per-route effect is needed to drive it anymore.

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
    <CoachChatContext.Provider value={() => setCoachChatOpen(true)}>
    <SettingsSheetContext.Provider value={() => navigate({ search: '?sheet=settings' })}>
      <SwipeProgressProvider>
      {/* Rendered outside the min-h-screen wrapper below, and that wrapper's
          own explicit bg-bg is dropped in favor of body's identical
          background (see index.css) — an opaque sibling paints over a
          negative-z-index fixed element regardless of z-index, since that's
          a later, non-positioned paint step that simply covers whatever's
          behind it; body's own canvas-level background doesn't have that
          problem, it's always the bottom-most layer.
          Mounted unconditionally, not just inside the four main areas — a
          Sheet portalled to document.body from Einstellungen or anywhere
          else always has the same "t"-pattern texture behind it to blur
          (see AmbientBackground/.ambient-bg — no area-specific colour left
          to be conditional about since the rebrand). BackgroundRings, the
          decorative app-icon echo that used to sit alongside this, is gone
          — the icon itself dropped the ring motif for the "t" mark this
          pattern already carries, so the echo would have pointed at a
          design that no longer exists. */}
      <AmbientBackground />
      {/* Was unconditionally on in v1.14.3, then disabled (v2.1): the WebGL
          layer tracked each flow-positioned card's position by reading
          getBoundingClientRect() once per requestAnimationFrame and
          redrawing the canvas there — but native scroll is driven by the
          browser's compositor thread, which can already be several pixels
          further along than whatever position the main thread last read by
          the time that frame actually paints. That gap was the "lags behind
          and drifts during scroll" the WebGL glass visibly showed under
          real use, for any surface that scrolls with the page.

          Round 2 (v2.2) tried re-enabling this scoped to `position: fixed`
          chrome only (GlassSurface's `webgl` prop below) — those don't move
          under a scroll, so the drift problem above can't apply to them.
          That part is sound and stays in place (BottomNav opts in). But
          turning `enabled` on at all surfaced a second, unrelated problem:
          appGlassShader.ts's scene() doesn't refract the real page — a
          fragment shader can't sample arbitrary DOM, so it paints its OWN
          hardcoded stand-in backdrop (still the pre-rebrand look: four
          colored nutrient rings + a top gradient, see its own doc comment)
          and refracts glass surfaces against *that*. With `enabled` on,
          that stand-in paints full-screen behind everything, well past
          just the opted-in surfaces — visibly wrong now that the real
          background is the neutral canvas + "t"-pattern texture, not that
          scene. Fixing that means teaching scene() to reproduce the
          *current* background (procedurally regenerating the "t"-tile
          texture in GLSL, not a quick tweak) before this can go back on —
          left disabled again until that's done on its own. */}
      <GlassStage lightRef={lightRef} enabled={false} />
      <div ref={setContainer} className="min-h-screen">
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
        {coachChatOpen && <CoachChatSheet onClose={() => setCoachChatOpen(false)} />}
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
    </CoachChatContext.Provider>
    </AddMealContext.Provider>
  )
}
