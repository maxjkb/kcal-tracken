type Loader = () => Promise<unknown>

const loaders: Record<string, Loader | undefined> = {}

/** Called once by SectionPreview, which owns the lazy() instances these belong to. */
export function registerSectionLoaders(next: Record<string, Loader>): void {
  Object.assign(loaders, next)
}

/**
 * Fetches a section's chunk ahead of time.
 *
 * Called on idle for both neighbours of the current page: the first swipe
 * toward a lazily-loaded area otherwise had to fetch its chunk *during* the
 * gesture, which is the one moment there is no time for it — the page would
 * arrive after the nav pill had already moved, which is exactly the
 * out-of-step transition this rework is meant to remove. Failures are ignored;
 * this is an optimisation, and the route's own Suspense boundary remains the
 * real loading path.
 */
export function preloadSection(path: string): void {
  void loaders[path]?.().catch(() => {})
}
