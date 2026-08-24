import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT, SPRING_FADE, SPRING_MOMENTUM } from '../lib/motionTokens'
import { SheetCloseContext } from '../hooks/useSheetClose'

const DRAG_DISMISS_DISTANCE = 120 // px
const DRAG_DISMISS_VELOCITY = 600 // px/s

/**
 * Shared bottom-sheet chrome (backdrop + material) for every modal in the
 * app — meal/recipe detail & editors, date/month/year pickers. Replaces the
 * near-identical `fixed inset-0 … bg-ink/30` markup that used to be
 * duplicated in each of them.
 *
 * Always portals to <body>: a sheet can be opened from anywhere, including
 * from within an ancestor that has its own `transform` (e.g. SlideInPage) —
 * a transformed ancestor becomes the containing block for a `position:
 * fixed` descendant, which would otherwise collapse the sheet to that
 * ancestor's own content box instead of the viewport.
 *
 * Materializes (opacity + scale + a slight rise) rather than just fading,
 * per Apple's "materialize, don't just fade" — the surface should read as a
 * real layer arriving, not a plain cross-fade. The dismiss-by-drag gesture
 * lives on a dedicated grab handle, not the whole sheet body, so it never
 * fights the sheet's own internal scrolling — `dragListener={false}` plus
 * `dragControls` means only the handle can start the drag, everywhere else
 * behaves exactly like a normal scrollable div.
 *
 * Note for callers passing a scrollable sheet: put the scroll on an inner
 * wrapper, not on the sheet element itself. The handle is a child of the
 * sheet element, so a sheet that scrolls would carry the handle out of view
 * with the first swipe.
 */
export function Sheet({
  onClose,
  children,
  sheetClassName,
  closeOnBackdropClick = true,
  closeOnDrag = true,
}: {
  onClose: () => void
  children: ReactNode
  /** Class name for the sheet's own outer element — each caller keeps full control of its own layout (max-width, padding, overflow, background). */
  sheetClassName: string
  /** Disable for forms with real data-loss risk on an accidental tap outside (Meal-/RecipeEditor). */
  closeOnBackdropClick?: boolean
  /** Disable for the same reason — an accidental swipe shouldn't discard in-progress input. */
  closeOnDrag?: boolean
}) {
  // `dismissedByDrag` picks the exit path, not just the timing — see below.
  const [closing, setClosing] = useState<false | 'button' | 'drag'>(false)
  const prefersReducedMotion = useReducedMotion()
  const dragControls = useDragControls()
  const requestClose = useCallback(() => setClosing('button'), [])

  const dragEnabled = closeOnDrag && !prefersReducedMotion

  // A sheet that was thrown downward should keep going the way it was thrown
  // (WWDC18: hint in the direction of the gesture) — pulling it back up to a
  // symmetric exit position would read as the interface fighting the user.
  // Every other dismissal retraces the entry path in reverse instead, so the
  // sheet always leaves the way it arrived.
  const exitState =
    closing === 'drag'
      ? { opacity: 0, scale: 1, y: '100%' }
      : { opacity: 0, scale: prefersReducedMotion ? 1 : 0.95, y: prefersReducedMotion ? 0 : 24 }

  const exitTransition = prefersReducedMotion
    ? REDUCED_MOTION_TRANSITION
    : closing === 'drag'
      ? SPRING_MOMENTUM
      : SPRING_DEFAULT

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {!closing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_FADE}
            onClick={closeOnBackdropClick ? requestClose : undefined}
          />
          <motion.div
            className={`relative ${sheetClassName}`}
            drag={dragEnabled ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            // Rigid upward (there's nothing above to reveal), freely following
            // downward — resistance in the direction the gesture can't go, none
            // in the direction it can.
            dragElastic={{ top: 0, bottom: 1 }}
            dragMomentum={false}
            onDragEnd={(_event, info) => {
              // Distance OR velocity: a slow long pull and a quick flick both
              // clearly mean "dismiss", and requiring both would make the flick
              // feel ignored.
              if (info.offset.y > DRAG_DISMISS_DISTANCE || info.velocity.y > DRAG_DISMISS_VELOCITY) {
                setClosing('drag')
              }
              // Otherwise Motion's own constraints spring it back to rest.
            }}
            initial={{ opacity: 0, scale: 0.95, y: prefersReducedMotion ? 0 : 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={exitState}
            transition={closing ? exitTransition : prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
          >
            {dragEnabled && (
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="absolute left-1/2 top-0 z-10 flex h-6 w-16 -translate-x-1/2 touch-none items-center justify-center"
                aria-hidden="true"
              >
                <div className="h-1.5 w-9 rounded-full bg-ink-faint/50" />
              </div>
            )}
            <SheetCloseContext.Provider value={requestClose}>{children}</SheetCloseContext.Provider>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
