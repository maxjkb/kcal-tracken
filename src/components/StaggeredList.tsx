import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { SPRING_DEFAULT } from '../lib/motionTokens'

/** Delay between consecutive items — small enough to read as one movement, not a queue. */
const STEP_S = 0.035
/** Beyond this the stagger stops accumulating, so a long list never ends in a visible wait. */
const MAX_STEPS = 8

/**
 * Fades a list in with a small cascade as it arrives.
 *
 * Used where content appears *after* a query resolves rather than with the
 * page — meal suggestions, supplement recommendations. A list that pops into
 * existence fully formed reads as a layout jump; letting the items arrive in
 * quick succession says "this was just fetched" without anyone having to be
 * told. The cascade is deliberately short (35 ms apart, capped at eight
 * steps): long enough to register as motion, far too short to wait for.
 *
 * Reduced motion drops the movement and the cascade entirely — items simply
 * appear, which is the non-vestibular equivalent the guidance asks for rather
 * than a slower version of the same slide.
 */
export function StaggeredList({ children, className }: { children: ReactNode[]; className?: string }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_DEFAULT, delay: Math.min(i, MAX_STEPS) * STEP_S }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}
