import { createContext, useContext } from 'react'

export const SheetExpandContext = createContext<(() => void) | null>(null)

/**
 * Call from anywhere inside a collapsible <Sheet> to grow it to full height
 * on demand — not via a drag, programmatically.
 *
 * For a step or view that swaps the docked peek row out for something that
 * needs the whole sheet (the review step's nutrition/ingredients, the recipe
 * picker, the barcode scanner): without this, the sheet stayed exactly as
 * tall as it was a moment before — whatever peek height the *previous* view's
 * docked row happened to need — and the new content sat clipped under
 * `overflow: hidden`, reachable only by a drag nothing on screen hinted at.
 *
 * A no-op on a sheet that isn't `collapsible` (there's nothing to expand —
 * it's already at its one and only height) or one that's already expanded.
 */
export function useSheetExpand(): () => void {
  const expand = useContext(SheetExpandContext)
  if (!expand) throw new Error('useSheetExpand must be used within <Sheet>')
  return expand
}
