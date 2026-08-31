import { Suspense, lazy } from 'react'
import { lazyRetry } from '../lib/lazyRetry'
import { FeedPage } from '../pages/FeedPage'
import { registerSectionLoaders } from '../lib/preloadSection'

/**
 * The four main areas' root pages, in one place.
 *
 * Centralised because they now have two callers — App's <Routes> and the
 * swipe gesture's neighbour preview — and calling `lazy()` twice for the same
 * module would produce two independent components with two separate loading
 * states, so the page you dragged into view would reload the instant it became
 * the real route.
 */
const loadStats = () => import('../pages/StatsPage').then((m) => ({ default: m.StatsPage }))
const loadRecipes = () => import('../pages/RecipesPage').then((m) => ({ default: m.RecipesPage }))
const loadSupplements = () => import('../pages/SupplementsPage').then((m) => ({ default: m.SupplementsPage }))

export const StatsPage = lazy(lazyRetry(loadStats))
export const RecipesPage = lazy(lazyRetry(loadRecipes))
export const SupplementsPage = lazy(lazyRetry(loadSupplements))

// Registered rather than exported: preloadSection is called from
// SwipeNavigator, and a module that exports both components and plain
// functions loses fast refresh for the components.
registerSectionLoaders({
  '/stats': loadStats,
  '/recipes': loadRecipes,
  '/supplements': loadSupplements,
  // Feed is in the main bundle — nothing to fetch.
})

const previewFallback = <div className="min-h-screen" />

/**
 * A section's root page, rendered off-screen so a swipe drags the real thing
 * into view instead of an empty viewport.
 *
 * Always the area's *root*, never a deeper route: swiping sideways out of a
 * recipe detail goes to the Rezepte list, so that is what should be coming in.
 * Inert while it's a preview (`pointer-events-none` and `aria-hidden` are set
 * by the caller) — it is scenery until the navigation commits.
 */
export function SectionPreview({ to }: { to: string }) {
  return (
    <Suspense fallback={previewFallback}>
      {to === '/' ? (
        <FeedPage />
      ) : to === '/stats' ? (
        <StatsPage />
      ) : to === '/recipes' ? (
        <RecipesPage />
      ) : to === '/supplements' ? (
        <SupplementsPage />
      ) : null}
    </Suspense>
  )
}
