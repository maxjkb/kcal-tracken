import { createContext, useContext, useEffect } from 'react'

/**
 * Lets a page claim the right-swipe for its own "back" instead of letting the
 * app's section navigation handle it.
 *
 * A recipe detail page sits inside the Rezepte section, which is the leftmost
 * of the four — so a right-swipe there would otherwise hit the end of the list
 * and rubber-band, when what it obviously means is "back to the list". Rather
 * than run a second gesture recogniser on the same element and have the two
 * fight, the page registers its intent and SwipeNavigator's existing recogniser
 * routes the gesture to it.
 */
export type BackHandlerRegistry = {
  set: (handler: (() => void) | null) => void
  get: () => (() => void) | null
}

export const BackSwipeContext = createContext<BackHandlerRegistry | null>(null)

/** Registers this view's back action for the duration of its mount. */
export function useRegisterBackSwipe(handler: (() => void) | null): void {
  const registry = useContext(BackSwipeContext)
  useEffect(() => {
    if (!registry) return
    registry.set(handler ?? null)
    return () => registry.set(null)
  })
}
