import { createContext, useContext } from 'react'

export const SheetCloseContext = createContext<(() => void) | null>(null)

/**
 * Call from anywhere inside a <Sheet> to trigger its graceful exit animation
 * before it actually unmounts. Prefer this over a raw `onClose` prop for any
 * in-sheet "close"/"done" action (the ✕ button, a completed save), so
 * dismissal always animates consistently. The raw `onClose` passed to
 * `<Sheet>` itself is reserved for the moment the exit animation has
 * actually finished — it's what unmounts the sheet for real.
 */
export function useSheetClose(): () => void {
  const close = useContext(SheetCloseContext)
  if (!close) throw new Error('useSheetClose must be used within <Sheet>')
  return close
}
