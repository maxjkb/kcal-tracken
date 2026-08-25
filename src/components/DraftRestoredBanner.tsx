import { motion, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT } from '../lib/motionTokens'

/**
 * Shown at the top of an editor sheet that just restored an unsaved draft.
 *
 * Restoring silently would be its own kind of confusion — reopening "add meal"
 * and finding it pre-filled reads as a bug unless something says why. So the
 * values come back automatically (that's the whole point: carry on where you
 * left off), and this explains it and offers the one-tap way out for the case
 * where the close was deliberate after all.
 */
export function DraftRestoredBanner({ onDiscard }: { onDiscard: () => void }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    // Arrives rather than blinking into place: it explains something that has
    // already happened to the form, so it should read as a notice appearing,
    // not as part of the layout that was always there.
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
      className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-section-12 px-3 py-2"
    >
      <p className="text-xs text-ink-soft">Nicht gespeicherter Entwurf wiederhergestellt.</p>
      <button
        type="button"
        onClick={onDiscard}
        className="shrink-0 text-xs font-semibold text-section underline-offset-2 hover:underline"
      >
        Verwerfen
      </button>
    </motion.div>
  )
}
