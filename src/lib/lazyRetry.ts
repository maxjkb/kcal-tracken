/**
 * Wraps a dynamic import() (as used by React.lazy) so that a failed chunk
 * load — typically because the browser is still holding an old cached
 * index.html that references a hashed filename no longer present on the
 * server after a new deploy replaced it — triggers exactly one forced page
 * reload to pick up the fresh index.html and asset manifest, instead of
 * leaving the user on a route that silently fails to render.
 */
const RELOAD_FLAG = 'kcal-tracker:chunk-reload-attempted'

/**
 * Every storage access here is guarded. Where site data is blocked (Safari
 * with cookies off, some sandboxed embeddings) sessionStorage *throws* rather
 * than returning null — and an unguarded `removeItem` on the success path
 * turned a chunk that had loaded perfectly into a rejected loader, so the
 * route simply never rendered. Losing the flag only costs one extra reload
 * attempt; losing the route costs the page.
 */
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null
  } catch {
    return false
  }
}

function writeFlag(value: '1' | null): void {
  try {
    if (value === null) sessionStorage.removeItem(RELOAD_FLAG)
    else sessionStorage.setItem(RELOAD_FLAG, value)
  } catch {
    // See above.
  }
}

export function lazyRetry<T>(factory: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const module = await factory()
      writeFlag(null)
      return module
    } catch (error) {
      if (!readFlag()) {
        writeFlag('1')
        window.location.reload()
        // Reload takes over — never resolve so React.lazy doesn't render an error.
        return new Promise<T>(() => {})
      }
      throw error
    }
  }
}
