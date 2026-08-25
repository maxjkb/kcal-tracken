import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT, SPRING_FADE, SPRING_MOMENTUM } from '../lib/motionTokens'
import { SheetCloseContext } from '../hooks/useSheetClose'
import { lockBodyScroll, unlockBodyScroll } from '../lib/scrollLock'

/** Downward movement before a touch is read as a dismiss rather than a scroll. */
const DISMISS_INTENT_PX = 10
/** How much more vertical than horizontal that movement has to be. */
const VERTICAL_BIAS = 1.2
/** Projected travel that commits the dismiss. */
const DISMISS_DISTANCE = 120
/** Movement under this, from a pointer that never really moved, is a tap on the handle. */
const TAP_SLOP = 8

/** Apple's scroll-deceleration projection — where a flick would come to rest. */
function project(velocity: number, decelerationRate = 0.995): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance upward, where there is nothing to reveal. */
function rubberband(offset: number, dimension: number, constant = 0.55): number {
  return (offset * dimension * constant) / (dimension + constant * Math.abs(offset))
}

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
 * The page behind is frozen for as long as a sheet is mounted (see
 * lib/scrollLock.ts) — a sheet you can scroll the page behind reads as a web
 * page with an overlay rather than as a sheet.
 *
 * **The dismiss gesture is hand-rolled rather than Motion's `drag`.** It has
 * to work from anywhere in the sheet, which means it can only be recognised
 * *after* a touch has been identified as a downward pull rather than a scroll
 * — and `dragControls.start()` called from a pointermove does not establish a
 * working drag session, so the sheet simply never moved. Owning the gesture
 * also makes the apple-design fundamentals explicit: 1:1 tracking downward,
 * progressive resistance upward (§9), momentum projection to decide the
 * outcome (§6), and the release velocity handed to whichever spring runs next
 * so there is no seam between dragging and animating (§5).
 *
 * Two nested motion elements on purpose: the outer one owns `y` (the gesture),
 * the inner one owns opacity/scale (mount and unmount via AnimatePresence).
 * Sharing one element would put two owners on the same `y` and neither would
 * win predictably.
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
  const [closing, setClosing] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const requestClose = useCallback(() => setClosing(true), [])

  const dragEnabled = closeOnDrag && !prefersReducedMotion
  const y = useMotionValue(0)

  // The page behind must not scroll. Tied to mount rather than to `closing`
  // so it stays frozen through the exit animation.
  useEffect(() => {
    lockBodyScroll()
    return unlockBodyScroll
  }, [])

  const gesture = useRef<{
    startX: number
    startY: number
    lastY: number
    lastTime: number
    velocity: number
    pointerId: number
    phase: 'undecided' | 'dragging' | 'abandoned'
  } | null>(null)

  /**
   * Whether a downward drag starting here should dismiss rather than scroll.
   * Only when every scrollable ancestor is already at its top: pulling a
   * half-scrolled list down has to scroll it back up first, exactly like a
   * native sheet, or the content above becomes unreachable.
   */
  function canDismissFrom(target: HTMLElement, sheet: HTMLElement): boolean {
    // "From anywhere" includes over the text field — on iOS a downward pull on
    // a compose sheet's body dismisses it, and carving out the largest element
    // in the sheet would make the gesture feel arbitrary. Caret placement is a
    // tap, not a drag, so the two don't collide; a scrolled textarea is still
    // caught below. Only genuinely drag-operated controls are excluded.
    if (target.closest('input[type="range"], select, [data-no-swipe]')) return false
    let node: HTMLElement | null = target
    while (node && node !== sheet.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1 && node.scrollTop > 0) return false
      node = node.parentElement
    }
    return true
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragEnabled || event.pointerType === 'mouse') return
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      pointerId: event.pointerId,
      phase: 'undecided',
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId || g.phase === 'abandoned') return

    const dy = event.clientY - g.startY
    const dx = event.clientX - g.startX

    if (g.phase === 'undecided') {
      // Anything that isn't a downward pull settles it once — no second guess
      // partway through, so a scroll can never turn into a dismiss halfway
      // down the list.
      if (dy < -DISMISS_INTENT_PX || Math.abs(dx) > Math.abs(dy) * VERTICAL_BIAS) {
        g.phase = 'abandoned'
        return
      }
      if (dy < DISMISS_INTENT_PX) return
      if (!canDismissFrom(event.target as HTMLElement, event.currentTarget)) {
        g.phase = 'abandoned'
        return
      }
      g.phase = 'dragging'
      // Capture so tracking survives the finger leaving the sheet's bounds.
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const dt = event.timeStamp - g.lastTime
    if (dt > 0) g.velocity = ((event.clientY - g.lastY) / dt) * 1000
    g.lastY = event.clientY
    g.lastTime = event.timeStamp

    // 1:1 downward, progressive resistance upward.
    y.set(dy >= 0 ? dy : rubberband(dy, window.innerHeight * 0.08))
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    gesture.current = null
    if (g.phase !== 'dragging') return

    const dy = event.clientY - g.startY
    const projected = dy + project(g.velocity)

    if (projected > DISMISS_DISTANCE) {
      // Keep going the way it was thrown (apple-design §8) rather than pulling
      // it back to a symmetric exit — that would read as the interface
      // fighting the user.
      animate(y, window.innerHeight, {
        ...SPRING_MOMENTUM,
        velocity: g.velocity,
        onComplete: () => setClosing(true),
      })
      return
    }
    // Not far enough: settle home, continuing at the finger's exact speed.
    animate(y, 0, { ...SPRING_MOMENTUM, velocity: g.velocity })
  }

  const handleDownAt = useRef<{ x: number; y: number } | null>(null)

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
          {/* Outer element owns the gesture's y; the inner one owns the
              mount/unmount opacity and scale. */}
          <motion.div
            className={`relative ${sheetClassName}`}
            style={{ y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <motion.div
              className="contents"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
              transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT}
            >
              {/* Always rendered, never gated on dragEnabled: the "✕" is gone
                  from every sheet, so this handle is the only affordance left.
                  Gating it would leave a reduced-motion user — or either
                  editor, which also blocks backdrop-dismiss — with a sheet
                  that cannot be closed at all. The swipe is what's
                  conditional; tapping always works. Sized for that promotion:
                  a 44x112px hitbox (past the 44pt minimum, wide enough to hit
                  without aiming) around a restrained 6x48px bar, kept as
                  separate elements so the target can grow without the grip
                  becoming a slab. */}
              <button
                type="button"
                onPointerDown={(e) => {
                  handleDownAt.current = { x: e.clientX, y: e.clientY }
                }}
                onClick={(e) => {
                  const down = handleDownAt.current
                  handleDownAt.current = null
                  // Keyboard activation reports 0/0 and has no down point — always a real tap.
                  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) return
                  requestClose()
                }}
                aria-label="Schließen"
                className="absolute left-1/2 top-0 z-10 flex h-11 w-28 -translate-x-1/2 items-center justify-center pt-1"
              >
                <div className="h-1.5 w-12 rounded-full bg-ink-faint/50" />
              </button>
              <SheetCloseContext.Provider value={requestClose}>{children}</SheetCloseContext.Provider>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
