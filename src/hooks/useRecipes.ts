import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MealType, type Recipe } from '../lib/db'
import { pushRecipeChange } from '../lib/sync'

/** All recipes in one category (Frühstück/Mittag/Abend/Snack), newest first. */
export function useRecipesForCategory(category: MealType): Recipe[] | undefined {
  return useLiveQuery(
    () => db.recipes.where('category').equals(category).reverse().sortBy('createdAt'),
    [category],
  )
}

/** All recipes, newest first — used by the "Rezept auswählen" picker in the meal editor. */
export function useAllRecipes(): Recipe[] | undefined {
  return useLiveQuery(() => db.recipes.orderBy('createdAt').reverse().toArray(), [])
}

/**
 * One recipe by id. `undefined` while the query is still running, `null` when
 * there is genuinely no such recipe.
 *
 * Dexie's `get` resolves to `undefined` for a miss, which is the same value
 * useLiveQuery reports while it is still loading — so a deleted or mistyped id
 * was indistinguishable from "not ready yet" and the detail page sat on
 * "Lädt…" forever.
 */
export function useRecipe(id: string | undefined): Recipe | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
  pushRecipeChange(null, id)
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await db.recipes.put(recipe)
  pushRecipeChange(recipe, recipe.id)
}
