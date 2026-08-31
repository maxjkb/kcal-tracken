import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT, SPRING_FADE, SPRING_MOMENTUM } from '../lib/motionTokens'
import { SheetCloseContext } from '../hooks/useSheetClose'
import { lockBodyScroll, unlockBodyScroll } from '../lib/scrollLock'

/** Movement before a touch is read as a sheet drag rather than a scroll. */
const DRAG_INTENT_PX = 8
/** How much more vertical than horizontal that movement has to be. */
const VERTICAL_BIAS = 1.2
/** Projected travel past the smallest detent that dismisses the sheet. */
const DISMISS_DISTANCE = 100
/** Movement under this, from a pointer that never really moved, is a tap on the handle. */
const TAP_SLOP = 8
/** Below this the touch is still a tap, and its default action (focusing a field) must survive. */
const TOUCH_INTENT_SLOP = 3

/** Apple's scroll-deceleration projection — where a flick would come to rest. */
function project(velocity: number, decelerationRate = 0.995): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance past the top, where there is nothing more to reveal. */
function rubberband(offset: number, dimension: number, constant = 0.55): number {
  return (offset * dimension * constant) / (dimension + constant * Math.abs(offset))
}

/**
 * Shared bottom-sheet chrome (backdrop + material) for every modal in the
 * app — meal/recipe detail & editors, date/month/year pickers.
 *
 * Always portals to <body>: a sheet can be opened from anywhere, including
 * from within an ancestor that has its own `transform` (e.g. SlideInPage) —
 * a transformed ancestor becomes the containing block for a `position: fixed`
 * descendant, which would otherwise collapse the sheet to that ancestor's own
 * content box instead of the viewport.
 *
 * The page behind is frozen for as long as a sheet is mounted (see
 * lib/scrollLock.ts) — a sheet you can scroll the page behind reads as a web
 * page with an overlay rather than as a sheet.
 *
 * ## Detents
 *
 * `detents` are the heights the sheet rests at, as fractions of its own full
 * height, smallest first — `[0.6, 1]` opens at 60% and expands to full when
 * dragged up. A tall editor that fills the screen the moment it opens buries
 * whatever was behind it and gives equal prominence to the supporting material
 * at the bottom; opening part-way keeps the page visible and lets the extra
 * content be pulled up only when it's wanted. The default `[1]` keeps the
 * short sheets (pickers, the supplement form) exactly as they were — a detent
 * on a sheet that's already short would only add empty space.
 *
 * ## Why the gesture is hand-rolled
 *
 * It has to work from anywhere in the sheet, which means it can only be
 * recognised *after* a touch has been identified as a vertical drag rather
 * than a scroll — and `dragControls.start()` called from a pointermove does
 * not establish a working Motion drag session, so the sheet simply never
 * moved. Owning it also makes the apple-design fundamentals explicit: 1:1
 * tracking, progressive resistance past the top (§9), momentum projection to
 * pick the resting detent (§6), and the release velocity handed to whichever
 * spring runs next so there's no seam between dragging and animating (§5).
 *
 * Two nested motion elements on purpose: the outer owns `y` (the gesture and
 * the detents), the inner owns opacity/scale (mount and unmount via
 * AnimatePresence). Sharing one element would put two owners on `y`.
 *
 * Note for callers passing a scrollable sheet: put the scroll on an inner
 * wrapper, not on the sheet element itself. The handle is a child of the sheet
 * element, so a sheet that scrolls would carry the handle out of view with the
 * first swipe.
 */
/**
 * Every sheet currently on screen, outermost first.
 *
 * A sheet used to exist nowhere in the browser's history, so the system back
 * gesture (or the Zurück button) popped the *route* instead — from a
 * sub-sheet that meant the whole stack vanished and the user landed back on
 * a main page, several steps further back than they asked for. Each open
 * sheet now occupies one history entry, so back peels exactly one layer:
 * sub-sheet → parent sheet → page.
 */
const openSheets: { close: () => void }[] = []

/**
 * history.back() calls this module made itself, to take a sheet's own entry
 * back off the stack when it closed by tap/save instead of by going back.
 * Those fire popstate too, and without this counter each one would be read
 * as a second back press and close the sheet underneath as well.
 */
let selfPops = 0

function handleSheetPop() {
  if (selfPops > 0) {
    selfPops--
    return
  }
  openSheets.pop()?.close()
}

export function Sheet({
  onClose,
  children,
  sheetClassName,
  closeOnBackdropClick = true,
  closeOnDrag = true,
  detents = [1],
  peekHeight,
  expandedHeight,
  manageHistory = true,
}: {
  onClose: () => void
  children: ReactNode
  /** Class name for the sheet's own outer element — each caller keeps full control of its own layout (max-width, padding, overflow, background). */
  sheetClassName: string
  /** Disable for forms with real data-loss risk on an accidental tap outside (Meal-/RecipeEditor). */
  closeOnBackdropClick?: boolean
  /** Disable for the same reason — an accidental swipe shouldn't discard in-progress input. */
  closeOnDrag?: boolean
  /** Resting heights as fractions of the sheet's full height, smallest first. Opens at the smallest. */
  detents?: number[]
  /**
   * Opens the sheet showing only this many pixels of itself, draggable up to
   * its full height. Unlike `detents`, which translate the sheet down and so
   * reveal its *top* strip, this changes the sheet's own height — which is
   * what a compose sheet needs, because the thing that has to stay on screen
   * (the text field) sits at its BOTTOM. Dragging up grows the sheet with the
   * finger and the content above the field comes into view; dragging back
   * down returns to the peek before a further pull dismisses.
   */
  peekHeight?: number
  /**
   * How tall the sheet should become when pulled open, if its own
   * `scrollHeight` would overstate it. MealEditor's steps sit side by side in
   * a carousel, so the sheet measures the tallest of them and would otherwise
   * open to a screen of empty space below a one-line field.
   */
  expandedHeight?: number
  /**
   * Whether this sheet manages its own history entry (see `openSheets`).
   * Only a sheet whose open state already lives in the URL sets this false —
   * SettingsSheet does, because it opens full pages from inside itself and so
   * has to survive a route change and come back, which a marker entry can't
   * express. Everything else leaves it on.
   */
  manageHistory?: boolean
}) {
  const [closing, setClosing] = useState(false)
  /** Only meaningful with `peekHeight`: whether the sheet has been pulled open. */
  const [expanded, setExpanded] = useState(false)
  const height = useMotionValue<number | 'auto'>(peekHeight ?? 'auto')
  const expandedRef = useRef(false)
  const prefersReducedMotion = useReducedMotion()
  const requestClose = useCallback(() => setClosing(true), [])

  // Claims one history entry for as long as this sheet is open, so the back
  // gesture closes it rather than navigating the page out from under it. The
  // pushed entry duplicates the current one (same URL, same router state), so
  // react-router sees no location change going either way — it exists purely
  // as something for `back` to consume.
  useEffect(() => {
    if (!manageHistory) return
    const entry = { close: requestClose }
    window.history.pushState(window.history.state, '')
    openSheets.push(entry)
    if (openSheets.length === 1) window.addEventListener('popstate', handleSheetPop)
    return () => {
      const i = openSheets.indexOf(entry)
      // Still listed means this sheet closed on its own (save, tap, swipe
      // down) rather than by a back press, so its entry is still on the
      // stack and has to come off. Closed *by* back and it is already gone.
      if (i !== -1) {
        openSheets.splice(i, 1)
        selfPops++
        window.history.back()
      }
      if (openSheets.length === 0) window.removeEventListener('popstate', handleSheetPop)
    }
  }, [manageHistory, requestClose])

  const dragEnabled = closeOnDrag && !prefersReducedMotion
  const y = useMotionValue(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  /**
   * Detents as `y` offsets, largest sheet first: 0 is fully open, a positive
   * value is that much of the sheet pushed off the bottom. Measured rather
   * than assumed, so a sheet capped at `max-h` gets detents of its real
   * height rather than of the viewport's.
   */
  const offsets = useRef<number[]>([0])
  const restIndex = useRef(0)

  // Keyboard-aware docking: how much of the layout viewport the on-screen
  // keyboard currently covers, tracked via visualViewport (not
  // window.innerHeight, which stays the full screen height throughout —
  // only visualViewport actually shrinks when the keyboard opens). Applied
  // as bottom padding on the sheet's own fixed positioning wrapper below,
  // not as an offset on `y`: `y` is the drag/detent gesture's own value,
  // and folding a second, unrelated reason to move into it would have the
  // keyboard's height fight the drag math (and vice versa) the moment both
  // are ever true together. Padding on a flex `items-end` container is a
  // completely independent way to push the same sheet up, so the two never
  // have to coordinate.
  //
  // A field with `position: fixed` (see components/DockedField.tsx) can't
  // do this itself when it lives inside a sheet: `y` above is a `transform`,
  // and any transformed ancestor becomes the containing block for a fixed
  // descendant — exactly the trap this component's own module doc already
  // portals the whole sheet out of. Moving the sheet's own bottom edge
  // sidesteps that entirely: nothing inside it needs `position: fixed` at
  // all, the field just stays in normal flow and the sheet carries it up.
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function update() {
      const active = document.activeElement
      const isTextEntry = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
      const withinThisSheet = isTextEntry && sheetRef.current?.contains(active)
      if (!withinThisSheet) {
        setKeyboardOffset(0)
        return
      }
      setKeyboardOffset(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop))
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  /** Recomputes the detent offsets from the sheet's current height. */
  const measure = useCallback(() => {
    const height = sheetRef.current?.offsetHeight ?? window.innerHeight
    const sorted = [...detents].sort((a, b) => b - a)
    offsets.current = sorted.map((fraction) => height * (1 - fraction))
    return height
    // `detents` is a literal at every call site, so a reference check would
    // re-run this on every render; its contents never change for a mounted sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Slide up from below on mount, to whichever detent the sheet opens at.
  // useLayoutEffect so the measurement and the starting offset are in place
  // before the first paint — otherwise the sheet flashes fully open.
  useLayoutEffect(() => {
    const height = measure()
    restIndex.current = offsets.current.length - 1

    const target = offsets.current[restIndex.current]
    if (prefersReducedMotion) {
      y.set(target)
      return
    }
    y.set(height)
    const entry = animate(y, target, SPRING_DEFAULT)
    return () => entry.stop()
  }, [measure, prefersReducedMotion, y])

  /**
   * Re-measures when the sheet's own height changes.
   *
   * A sheet's content is not fixed: the meal editor's second step is a
   * different height from its first, and a suggestion list grows as it loads.
   * Offsets measured once at mount go stale the moment that happens, and the
   * sheet then rests at an offset computed for a height it no longer has —
   * pushing its own controls off the bottom of the screen. Skipped while a
   * drag is in flight, where re-measuring would fight the finger.
   */
  useEffect(() => {
    const node = sheetRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (gesture.current?.phase === 'dragging') return
      measure()
      const target = offsets.current[Math.min(restIndex.current, offsets.current.length - 1)]
      if (Math.abs(y.get() - target) > 1) {
        settling.current?.stop()
        settling.current = animate(y, target, SPRING_DEFAULT)
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure, y])

  // Follow a changed height from the caller — in BOTH states. Collapsed, the
  // peek has to grow when the description field wraps, or the sheet keeps its
  // one-line height and cuts the taller row (and the send button with it) off
  // at the bottom. Open, the same applies to the content height.
  useEffect(() => {
    if (peekHeight == null) return
    const wanted = expandedRef.current ? expandedHeight : peekHeight
    if (wanted == null) return
    const target = Math.min(wanted, window.innerHeight * 0.92)
    const current = height.get()
    if (typeof current === 'number' && Math.abs(current - target) < 1) return
    settling.current?.stop()
    settling.current = animate(height, target, SPRING_DEFAULT)
  }, [expandedHeight, peekHeight, height])

  // The page behind must not scroll. Tied to mount rather than to `closing`
  // so it stays frozen through the exit animation.
  useEffect(() => {
    lockBodyScroll()
    return unlockBodyScroll
  }, [])

  /**
   * The settle/dismiss animation in flight, so a new touch can stop it.
   *
   * `MotionValue.set()` does not cancel a running animation — the spring keeps
   * overwriting the value on the next frame. Without this, grabbing a sheet
   * that was already flicked away did nothing (the finger moved, the sheet did
   * not), and the dismissal's onComplete still fired a few hundred
   * milliseconds later, closing the sheet out from under the hand that was
   * pulling it back. apple-design §3: every animation must be interruptible.
   */
  const settling = useRef<{ stop: () => void } | null>(null)

  const gesture = useRef<{
    startX: number
    startY: number
    startOffset: number
    lastY: number
    lastTime: number
    velocity: number
    pointerId: number
    /** Decided at touch-down: is a downward pull here a dismiss, or does content need scrolling back first? */
    canPullDown: boolean
    phase: 'undecided' | 'dragging' | 'abandoned'
  } | null>(null)

  /**
   * Whether a downward drag starting here should move the sheet rather than
   * scroll its content. Only when every scrollable ancestor is already at its
   * top: pulling a half-scrolled list down has to scroll it back up first,
   * exactly like a native sheet, or the content above becomes unreachable.
   *
   * Evaluated at touch-down rather than when the drag is recognised, because
   * that is the state the user actually started from — and because the
   * touchmove blocker below needs the answer before the first move.
   */
  function canPullDownFrom(target: HTMLElement): boolean {
    const sheet = sheetRef.current
    if (!sheet) return false
    // "From anywhere" includes over the text field — on iOS a downward pull on
    // a compose sheet's body dismisses it, and carving out the largest element
    // in the sheet would make the gesture feel arbitrary. Caret placement is a
    // tap, not a drag, so the two don't collide. Only genuinely drag-operated
    // controls are excluded.
    if (target.closest('input[type="range"], select, [data-no-swipe]')) return false
    let node: HTMLElement | null = target
    while (node && node !== sheet.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1 && node.scrollTop > 0) return false
      node = node.parentElement
    }
    return true
  }

  /**
   * Stops iOS Safari from claiming the touch.
   *
   * This is the fix for "the sheet can't be swiped away on my phone" while it
   * worked in every desktop browser. With nothing preventing the default,
   * Safari treats a downward pull at the top of a scroll container as its own
   * rubber-band, takes ownership of the touch, and fires `pointercancel` —
   * which killed the drag mid-gesture, so the sheet sprang back instead of
   * closing. Chromium doesn't do this, which is exactly why it never showed up
   * in testing.
   *
   * Must be a manually attached listener: React's onTouchMove is registered
   * passively, and a passive listener is forbidden from calling
   * preventDefault(). Only downward moves from a pull-eligible start are
   * blocked, so normal scrolling inside the sheet is untouched.
   */
  useEffect(() => {
    const node = sheetRef.current
    if (!node || !dragEnabled) return
    function onTouchMove(event: TouchEvent) {
      const g = gesture.current
      if (!g || g.phase === 'abandoned') return
      const touch = event.touches[0]
      if (!touch) return
      const dy = touch.clientY - g.startY
      // Never prevent the default before the finger has actually moved. A tap
      // always carries a pixel or two of jitter, and over the text field
      // `canPullDown` is deliberately true — so the old unconditional
      // preventDefault() on any downward pixel also cancelled the tap's own
      // default action, which on iOS is what focuses the field and raises the
      // keyboard. That is the "field only reacts after a delay" bug: the first
      // tap was being swallowed. A few pixels of slack is still far below what
      // Safari needs to claim the touch for its rubber-band, so the gesture it
      // was added for keeps working.
      if (Math.abs(dy) <= TOUCH_INTENT_SLOP && g.phase !== 'dragging') return
      const expanding = dy < 0 && (y.get() > 0 || (peekHeight != null && !expandedRef.current))
      if ((dy > 0 && g.canPullDown) || expanding || g.phase === 'dragging') {
        if (event.cancelable) event.preventDefault()
      }
    }
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => node.removeEventListener('touchmove', onTouchMove)
  }, [dragEnabled, y, peekHeight])

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragEnabled || event.pointerType === 'mouse') return
    settling.current?.stop()
    settling.current = null
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      startOffset: y.get(),
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      pointerId: event.pointerId,
      canPullDown: canPullDownFrom(event.target as HTMLElement),
      phase: 'undecided',
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId || g.phase === 'abandoned') return

    const dy = event.clientY - g.startY
    const dx = event.clientX - g.startX

    if (g.phase === 'undecided') {
      if (Math.abs(dx) > Math.abs(dy) * VERTICAL_BIAS) {
        g.phase = 'abandoned'
        return
      }
      if (Math.abs(dy) < DRAG_INTENT_PX) return
      // Down closes (needs the content at its top); up expands — either into
      // a larger detent, or (with `peekHeight`) by growing the sheet itself.
      const wantsExpand = dy < 0 && (g.startOffset > 0 || (peekHeight != null && !expandedRef.current))
      if (!(dy > 0 ? g.canPullDown : wantsExpand)) {
        g.phase = 'abandoned'
        return
      }
      g.phase = 'dragging'
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const dt = event.timeStamp - g.lastTime
    if (dt > 0) g.velocity = ((event.clientY - g.lastY) / dt) * 1000
    g.lastY = event.clientY
    g.lastTime = event.timeStamp

    // With a peek height, an upward pull grows the sheet under the finger
    // instead of sliding it — the text field has to stay put at the bottom
    // while the content above it comes into view (apple-design §2: touch and
    // content move together).
    if (peekHeight != null && !expandedRef.current && dy < 0) {
      const grown = Math.min(peekHeight - dy, maxSheetHeight())
      height.set(grown)
      return
    }
    // 1:1 within range, progressive resistance past the largest detent.
    const next = g.startOffset + dy
    y.set(next >= 0 ? next : rubberband(next, window.innerHeight * 0.06))
  }

  /** The tallest this sheet may become — its own content, capped by the caller's max-height. */
  function maxSheetHeight(): number {
    const node = sheetRef.current
    const natural = expandedHeight ?? node?.scrollHeight ?? window.innerHeight * 0.92
    return Math.min(natural, window.innerHeight * 0.92)
  }

  /**
   * Release of a peek-height drag: project where the throw was heading
   * (apple-design §6) and settle to whichever end it was actually aimed at,
   * rather than to whichever is nearer at the instant the finger left.
   */
  function settlePeek(velocity: number) {
    const current = typeof height.get() === 'number' ? (height.get() as number) : (peekHeight ?? 0)
    const full = maxSheetHeight()
    const projected = current - project(velocity)
    const open = projected > (peekHeight ?? 0) + (full - (peekHeight ?? 0)) * 0.35
    expandedRef.current = open
    setExpanded(open)
    settling.current = animate(height, open ? full : (peekHeight ?? 0), {
      ...SPRING_MOMENTUM,
      velocity: -velocity,
      onComplete: () => {
        settling.current = null
        // Back to `auto` once open, so the sheet keeps following its own
        // content (a photo preview arriving, the field wrapping) instead of
        // being frozen at whatever it measured mid-gesture — but only when
        // the caller hasn't told us what "open" means. With `expandedHeight`
        // set, `auto` is exactly the overstated measurement that prop exists
        // to correct, and falling back to it undid the cap the moment the
        // spring finished.
        if (open && expandedHeight == null) height.set('auto')
      },
    })
  }

  /** Snap to the nearest detent, or dismiss if thrown past the smallest one. */
  function settle(velocity: number) {
    if (peekHeight != null && !expandedRef.current) {
      settlePeek(velocity)
      return
    }
    const current = y.get()
    const projected = current + project(velocity)
    const smallest = offsets.current[offsets.current.length - 1]

    if (projected > smallest + DISMISS_DISTANCE) {
      // Keep going the way it was thrown (apple-design §8) rather than pulling
      // it back to a symmetric exit — that would read as the interface
      // fighting the user.
      settling.current = animate(y, (sheetRef.current?.offsetHeight ?? window.innerHeight) + 40, {
        ...SPRING_MOMENTUM,
        velocity,
        onComplete: () => {
          settling.current = null
          setClosing(true)
        },
      })
      return
    }

    let nearest = 0
    let bestDistance = Infinity
    offsets.current.forEach((offset, i) => {
      const distance = Math.abs(projected - offset)
      if (distance < bestDistance) {
        bestDistance = distance
        nearest = i
      }
    })
    restIndex.current = nearest
    settling.current = animate(y, offsets.current[nearest], { ...SPRING_MOMENTUM, velocity })
  }

  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    gesture.current = null
    if (g.phase !== 'dragging') return
    // Deliberately not reading the event's own coordinates: on a
    // `pointercancel` those are unreliable, and treating a cancelled drag as a
    // release at the wrong position was the second half of the iOS bug —
    // the sheet sprang back because `dy` came out far too small. The tracked
    // position and velocity are always the real ones.
    settle(g.velocity)
  }

  const handleDownAt = useRef<{ x: number; y: number } | null>(null)

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {!closing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center transition-[padding-bottom] duration-150 ease-out sm:items-center"
          style={{ paddingBottom: keyboardOffset }}
        >
          <motion.div
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_FADE}
            onClick={closeOnBackdropClick ? requestClose : undefined}
          />
          <motion.div
            ref={sheetRef}
            className={`relative ${sheetClassName}`}
            // `height` only participates when the caller asked for a peek —
            // otherwise it stays 'auto' and the sheet sizes itself exactly as
            // it always did.
            style={peekHeight != null ? { y, height, overflow: expanded ? undefined : 'hidden' } : { y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          >
            <motion.div
              className="contents"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_FADE}
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
