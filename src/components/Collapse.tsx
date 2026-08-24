import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT } from '../lib/motionTokens'

/**
 * Animates its content open/closed instead of snapping it in and out of the
 * DOM. Used for every disclosure in the app — the Feed's meal-type sections,
 * the Beschreibung/Zutaten sections in the meal detail, the recipe detail's
 * sections — so they all expand with the same critically damped spring.
 *
 * `height: auto` is animatable here because Motion measures the content and
 * animates to the measured pixel height, then hands control back to `auto`
 * once settled (so later content changes don't get stuck at a stale height).
 *
 * `overflow: hidden` is what clips the content while it grows — but it stays
 * applied only *during* the animation. Left on permanently it would crop the
 * soft card shadows inside, so it's released once the spring settles open.
 *
 * Under `prefers-reduced-motion` it degrades to a plain opacity cross-fade
 * with no height movement, per Apple's reduced-motion guidance.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion()
  const [settled, setSettled] = useState(open)

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(true)}
          style={{ overflow: settled ? 'visible' : 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
