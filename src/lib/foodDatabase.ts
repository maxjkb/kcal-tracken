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

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'

/**
 * Looks up one product by its scanned barcode (EAN-13/UPC-A/EAN-8) — the
 * exact-match counterpart to searchFoodDatabase's fuzzy name search. Same
 * free, no-key Open Food Facts database, same best-effort contract: a
 * network hiccup, an unlisted barcode, or a listed product with incomplete
 * nutrition data all just resolve to null rather than throwing, so the
 * scanner UI has one simple "found / not found" branch to handle.
 */
export async function lookupFoodByBarcode(barcode: string): Promise<FoodDatabaseMatch | null> {
  const code = barcode.trim()
  if (!code) return null

  const url = `${PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as {
      status?: number
      product?: { product_name?: unknown; brands?: unknown; nutriments?: Record<string, unknown> }
    }
    // status 0 = barcode not found in the database at all, distinct from a
    // network/HTTP failure — both end up as null here, but this is why a
    // 200 response can still mean "no product".
    if (data.status !== 1 || !data.product) return null

    const n = data.product.nutriments
    if (!n) return null
    const kcal = n['energy-kcal_100g']
    const protein = n['proteins_100g']
    const carbs = n['carbohydrates_100g']
    const fat = n['fat_100g']
    if (![kcal, protein, carbs, fat].every((v) => typeof v === 'number' && Number.isFinite(v))) return null

    const rawName = data.product.product_name
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : code
    // The brand alone (before the first comma — OFF lists all of a brand
    // group's names there) appended when it isn't already part of the
    // product name, so "Nutella" doesn't become "Nutella (Ferrero, Nutella)".
    const rawBrand = data.product.brands
    const brand = typeof rawBrand === 'string' ? rawBrand.split(',')[0]?.trim() : ''
    const displayName = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name

    return {
      name: displayName,
      kcal100g: kcal as number,
      protein100g: protein as number,
      carbs100g: carbs as number,
      fat100g: fat as number,
    }
  } catch {
    return null
  }
}
