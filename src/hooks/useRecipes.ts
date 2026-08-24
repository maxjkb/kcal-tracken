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

export function useRecipe(id: string | undefined): Recipe | undefined {
  return useLiveQuery(() => (id ? db.recipes.get(id) : undefined), [id])
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
  pushRecipeChange(null, id)
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await db.recipes.put(recipe)
  pushRecipeChange(recipe, recipe.id)
}
