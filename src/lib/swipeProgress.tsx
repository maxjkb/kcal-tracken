import type { ReactNode } from 'react'
import { useMotionValue } from 'motion/react'
import { SwipeProgressContext } from './swipeProgressContext'

/**
 * Owns the shared swipe progress.
 *
 * Sits above both the swipeable content and the bottom nav, because the nav is
 * the content's *sibling*, not its child — and the whole point of the value is
 * that the two move together, so neither can own it.
 */
export function SwipeProgressProvider({ children }: { children: ReactNode }) {
  const progress = useMotionValue(0)
  return <SwipeProgressContext.Provider value={progress}>{children}</SwipeProgressContext.Provider>
}
