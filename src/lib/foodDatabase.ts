/**
 * Grounds AI nutrition estimates against Open Food Facts — a free, public,
 * no-API-key-required product database — so branded/packaged items (a
 * specific pasta sauce, a specific brand of yogurt, …) get real label
 * values instead of a pure LLM guess. This is a genuine additional
 * external network dependency (per the user's explicit choice), on top of
 * Gemini — but entirely best-effort: any failure (network, no match, an
 * incomplete product entry) just means the estimate falls back to
 * Gemini's own knowledge, exactly as it worked before this existed.
 */

export interface FoodDatabaseMatch {
  name: string
  /** Per 100g/100ml, straight from the product's Open Food Facts entry. */
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
}

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'

/** Looks up one candidate food/product name; returns its per-100g nutriments, or null if nothing usable was found. */
export async function searchFoodDatabase(query: string): Promise<FoodDatabaseMatch | null> {
  const q = query.trim()
  if (!q) return null

  const url = `${SEARCH_URL}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { products?: unknown[] }
    const products = Array.isArray(data.products) ? data.products : []

    for (const raw of products) {
      const p = raw as { product_name?: unknown; nutriments?: Record<string, unknown> }
      const n = p.nutriments
      if (!n) continue
      const kcal = n['energy-kcal_100g']
      const protein = n['proteins_100g']
      const carbs = n['carbohydrates_100g']
      const fat = n['fat_100g']
      if ([kcal, protein, carbs, fat].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return {
          name: typeof p.product_name === 'string' && p.product_name ? p.product_name : q,
          kcal100g: kcal as number,
          protein100g: protein as number,
          carbs100g: carbs as number,
          fat100g: fat as number,
        }
      }
    }
    return null
  } catch {
    // Network hiccup, CORS, whatever — grounding is an enhancement, never a hard requirement.
    return null
  }
}

/** Looks up several candidate names in parallel, dropping any that didn't resolve to a usable match. */
export async function searchFoodDatabaseMany(queries: string[]): Promise<FoodDatabaseMatch[]> {
  const results = await Promise.all(queries.map((q) => searchFoodDatabase(q)))
  return results.filter((r): r is FoodDatabaseMatch => r !== null)
}
