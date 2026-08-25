import { createContext, useContext } from 'react'

/**
 * Opens the "Mahlzeit hinzufügen" editor for today.
 *
 * The "+" moved out of the bottom nav and onto each page's own header, so the
 * pages now need to reach an action App owns. A context rather than prop
 * drilling: the pages between App and PageHeader are lazy-loaded route
 * components that have no other reason to know about meal creation.
 */
export const AddMealContext = createContext<(() => void) | null>(null)

export function useAddMeal(): () => void {
  const addMeal = useContext(AddMealContext)
  if (!addMeal) throw new Error('useAddMeal must be used within AddMealContext')
  return addMeal
}
