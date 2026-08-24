import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT } from '../lib/motionTokens'

/**
 * Slides its content in from the right on mount. Used only by the Rezepte
 * pages — reached via their own dedicated bottom-nav icon and, per the
 * request, meant to visibly "slide over" the current screen instead of
 * just appearing like every other route swap in the app.
 *
 * A critically damped spring (no overshoot — this is a layout transition,
 * not something gesture-released) stands in for the old fixed-duration CSS
 * transition. `prefers-reduced-motion` gets a short cross-fade instead of a
 * slide, per Apple's reduced-motion guidance.
 */
export function SlideInPage({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
      animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
      transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
    >
      {children}
    </motion.div>
  )
}
