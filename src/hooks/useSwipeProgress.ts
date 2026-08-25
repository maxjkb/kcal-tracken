import { useContext } from 'react'
import type { MotionValue } from 'motion/react'
import { SwipeProgressContext } from '../lib/swipeProgressContext'

/** The fractional section index the page and the nav pill are both driven from — see lib/swipeProgress.tsx. */
export function useSwipeProgress(): MotionValue<number> | null {
  return useContext(SwipeProgressContext)
}
