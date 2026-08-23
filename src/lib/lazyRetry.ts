/**
 * Wraps a dynamic import() (as used by React.lazy) so that a failed chunk
 * load — typically because the browser is still holding an old cached
 * index.html that references a hashed filename no longer present on the
 * server after a new deploy replaced it — triggers exactly one forced page
 * reload to pick up the fresh index.html and asset manifest, instead of
 * leaving the user on a route that silently fails to render.
 */
export function lazyRetry<T>(factory: () => Promise<T>): () => Promise<T> {
  return async () => {
    const RELOAD_FLAG = 'kcal-tracker:chunk-reload-attempted'
    try {
      const module = await factory()
      sessionStorage.removeItem(RELOAD_FLAG)
      return module
    } catch (error) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1')
        window.location.reload()
        // Reload takes over — never resolve so React.lazy doesn't render an error.
        return new Promise<T>(() => {})
      }
      throw error
    }
  }
}
