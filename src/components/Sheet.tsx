import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT, SPRING_FADE, SPRING_MOMENTUM } from '../lib/motionTokens'
import { SheetCloseContext } from '../hooks/useSheetClose'
import { SheetExpandContext } from '../hooks/useSheetExpand'
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

/**
 * Entries left behind by sheets that closed, waiting to see whether another
 * sheet takes one over before they are given back to the browser.
 *
 * Needed because one sheet can *replace* another in a single commit — the
 * Mahlzeiten-Editor closing back to the Mahlzeit-Detail it was opened from,
 * or SupplementFormSheet back to SupplementDetailSheet. There the old sheet's
 * cleanup and the new sheet's mount run in the same React commit, and the
 * two used to fight over history: the closing sheet called history.back(),
 * which the browser performs *asynchronously*, while the opening sheet
 * pushed its own entry synchronously right after. The traversal then landed
 * on the entry that had just been pushed, arriving with `selfPops` in
 * whatever state the previous swap had left it — sometimes absorbed,
 * sometimes read as a real back press that closed the sheet that had only
 * just opened. Which is what it looked like from the outside: editing a meal
 * and closing the editor dropped you all the way out to the Feed instead of
 * back to the meal.
 *
 * So a closing sheet no longer touches history directly. It leaves its entry
 * here; a sheet mounting in the same commit adopts it and skips its own
 * push, and only what nobody adopted is handed back, once, from a microtask
 * after the commit has settled.
 */
let orphanedEntries = 0

function releaseOrphanedEntries() {
  while (orphanedEntries > 0) {
    orphanedEntries--
    selfPops++
    window.history.back()
  }
}

function handleSheetPop() {
  if (selfPops > 0) {
    selfPops--
    return
  }
  openSheets.pop()?.close()
}

/**
 * Attached on the first sheet ever opened and then left in place for good.
 *
 * It used to be added when the first sheet opened and removed when the last
 * one closed — which dropped it in the exact window where it was still
 * needed. Closing the last sheet takes its own entry back with
 * history.back(), and the browser delivers that popstate asynchronously,
 * *after* the cleanup that removed the listener had already run. Nobody was
 * left to consume it, so `selfPops` stayed at 1 and the next real back press
 * was swallowed as if it were that self-issued one: open a sheet, close it
 * by the grip, open it again, press back — and nothing happened. Second
 * press worked. That is what an "unround" back gesture felt like, and it got
 * one step worse with every close.
 *
 * Keeping one listener costs nothing: with no sheets open it pops an empty
 * array and lets the route handle its own back.
 */
let listening = false
function ensureSheetPopListener() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', handleSheetPop)
}

export function Sheet({
  onClose,
  children,
  sheetClassName,
  closeOnBackdropClick = true,
  closeOnDrag = true,
  detents = [1],
  collapsible = false,
  startExpanded = false,
  manageHistory = true,
  dismiss = false,
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
   * Opens the sheet with the child marked `data-sheet-collapse` hidden —
   * everything else (its grip, a header, a docked input row marked
   * `data-sheet-peek`) stays visible — and lets it be dragged up to full
   * height.
   *
   * Unlike `detents`, which translate the sheet down and so reveal its *top*
   * strip, this changes the sheet's own height — which is what a compose
   * sheet needs, because the thing that has to stay on screen (the text
   * field) sits at its BOTTOM. Dragging up grows the sheet with the finger
   * and the content above the field comes into view; dragging back down
   * returns to the peek before a further pull dismisses.
   */
  collapsible?: boolean
  /**
   * Mounts a `collapsible` sheet already fully expanded, instead of
   * collapsing to peek first and growing from there.
   *
   * For the one case where the peek view was never the right starting
   * point at all — the Mahlzeiten-Editor opened onto an existing meal opens
   * straight onto its review step, which has no docked field to peek at.
   * Collapsing to peek on mount and then immediately re-expanding (see
   * `useSheetExpand`) would work too, but risks a one-frame flash of the
   * wrong height; deciding it once, before the first paint, doesn't.
   */
  startExpanded?: boolean
  /**
   * Whether this sheet manages its own history entry (see `openSheets`).
   * Only a sheet whose open state already lives in the URL sets this false —
   * SettingsSheet does, because it opens full pages from inside itself and so
   * has to survive a route change and come back, which a marker entry can't
   * express. Everything else leaves it on.
   */
  manageHistory?: boolean
  /**
   * Asks the sheet to close itself, from outside.
   *
   * For a sheet whose open state lives in the URL rather than in the parent's
   * own state (Einstellungen): the parent can't just stop rendering it when
   * the route changes, because that rips it out of the tree and the slide-out
   * below never runs — the sheet vanished between one frame and the next on
   * every back press, while every other sheet in the app slid away. So the
   * parent keeps it mounted, flips this instead, and unmounts on `onClose`.
   */
  dismiss?: boolean
}) {
  const [closing, setClosing] = useState(false)
  /**
   * The sheet is on its way out but still on screen.
   *
   * Separate from `closing`, which unmounts it: the dim behind the sheet has
   * to fade *while* the sheet slides down, not after it has already gone.
   * Fading it on unmount left the backdrop at full strength for the whole
   * slide and then dropped it — the sheet left, and the room stayed dark for
   * another quarter second.
   */
  const [dismissing, setDismissing] = useState(false)
  /** Only meaningful with `peekHeight`: whether the sheet has been pulled open. */
  const [expanded, setExpanded] = useState(startExpanded)
  const height = useMotionValue<number | 'auto'>('auto')
  const expandedRef = useRef(startExpanded)
  const handleRef = useRef<HTMLButtonElement>(null)
  /**
   * How tall the sheet is while collapsed, measured rather than summed.
   *
   * Summing the parts (grip + header + docked row) was tried and kept coming
   * out short — each settles at a different moment, and one stale reading
   * silently truncated the peek until the text field was clipped away with
   * only the buttons under it showing. Measuring down TO the docked row is
   * no good either: it is the last child, so its bottom is the sheet's
   * bottom and the answer is always the full height.
   *
   * What actually defines the collapsed height is everything that is NOT the
   * scrolling middle. So the caller marks that middle `data-sheet-collapse`,
   * and this is the sheet's natural height minus it — measured once on
   * mount while nothing is clipped yet, then kept current by tracking the
   * docked part's own growth (a wrapping field grows the peek by as much as
   * it grew itself).
   */
  const peekPx = useRef<number | null>(null)
  const prefersReducedMotion = useReducedMotion()
  // Read from inside requestClose, which is a stable useCallback([]) — a
  // captured boolean would be whatever it was on first render.
  const reducedMotionRef = useRef(prefersReducedMotion)
  reducedMotionRef.current = prefersReducedMotion

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

  // Measure the collapsed height once, before the first paint, while the
  // sheet still has its natural height — then collapse to it, unless the
  // caller already knows this sheet has nothing to peek at (`startExpanded`).
  useLayoutEffect(() => {
    if (!collapsible) return
    const sheet = sheetRef.current
    const collapsing = sheet?.querySelector('[data-sheet-collapse]')
    if (!sheet || !collapsing) return
    const peek = sheet.getBoundingClientRect().height - collapsing.getBoundingClientRect().height
    peekPx.current = peek
    if (!startExpanded) height.set(peek)
    // Mount only — the effect below keeps it current from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Recomputes the collapsed height from scratch — an absolute figure, never
   * an accumulated delta.
   *
   * The delta-tracking version of this (diff the peek marker's own size
   * against its last-seen size, add the difference) silently corrupted
   * `peekPx` the moment the marker was ever removed from the DOM: a detached
   * element's `getBoundingClientRect()` reports all zeros, which read as
   * "the docked row just shrank by its entire height" and subtracted that
   * from the peek. That is exactly what happens when a caller swaps the
   * docked row out for a full-content view (a recipe list, a barcode
   * scanner) — the one moment this measurement most needs to stay correct.
   * Recomputing the absolute value fresh every time is immune to that: it
   * doesn't matter whether the marker was there a moment ago, only what's
   * there right now.
   *
   * Skipped mid-drag (would fight the finger) and while expanded (nothing
   * currently on screen depends on the answer — see `expandNow`'s own
   * comment on the trade-off that leaves).
   */
  const remeasurePeek = useCallback(() => {
    if (!collapsible || expandedRef.current || gesture.current?.phase === 'dragging') return
    const sheet = sheetRef.current
    const collapsing = sheet?.querySelector('[data-sheet-collapse]')
    if (!sheet || !collapsing) return
    const peek = sheet.getBoundingClientRect().height - collapsing.getBoundingClientRect().height
    if (peekPx.current != null && Math.abs(peek - peekPx.current) < 1) return
    peekPx.current = peek
    settling.current?.stop()
    settling.current = animate(height, peek, SPRING_DEFAULT)
  }, [collapsible, height])

  // Keeps the collapsed height in step with whatever the docked row actually
  // needs. Two triggers, because a size change can happen two different ways:
  // a ResizeObserver on the current peek marker for continuous growth (the
  // description field wrapping to a second line), and a MutationObserver on
  // the whole sheet for structural change (the docked row itself being
  // swapped for a recipe list, or reappearing afterward) — the marker is a
  // different DOM node each time that happens, so the ResizeObserver has to
  // be re-attached to whichever one currently exists, not the one it started
  // watching at mount.
  useEffect(() => {
    if (!collapsible || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return
    const sheet = sheetRef.current
    if (!sheet) return
    let currentMarker: Element | null = null
    const markerObserver = new ResizeObserver(remeasurePeek)
    function syncMarker() {
      const marker = sheet!.querySelector('[data-sheet-peek]')
      if (marker === currentMarker) return
      markerObserver.disconnect()
      currentMarker = marker
      if (marker) markerObserver.observe(marker)
      remeasurePeek()
    }
    syncMarker()
    const structureObserver = new MutationObserver(syncMarker)
    structureObserver.observe(sheet, { childList: true, subtree: true })
    return () => {
      markerObserver.disconnect()
      structureObserver.disconnect()
    }
  }, [collapsible, remeasurePeek])

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

  /**
   * Closes the sheet the same way a downward swipe does: it slides off the
   * bottom edge, then unmounts.
   *
   * This used to be a bare `setClosing(true)`, which meant the sheet simply
   * faded away in place — while a swipe-dismissed sheet slid down (see
   * settle()). So the exact same sheet left by two different routes
   * depending on how you dismissed it, and the common one — the grip, the
   * backdrop, the back gesture, every "Speichern"/"Abbrechen" button — was
   * the one that didn't move. A sheet that arrives from the bottom edge has
   * to leave through it:
   * > **apple-design §7**: "If something disappears one way, we expect it to
   * > emerge from where it came."
   *
   * `closeRequested` guards re-entry: the backdrop tap and the history pop
   * can both land, and starting the slide twice restarts it from wherever
   * the first one had got to.
   */
  const closeRequested = useRef(false)
  const requestClose = useCallback(() => {
    if (closeRequested.current) return
    closeRequested.current = true
    setDismissing(true)
    // Reduced motion gets the cross-fade it asks for, not a slide.
    if (reducedMotionRef.current) {
      setClosing(true)
      return
    }
    settling.current?.stop()
    settling.current = animate(y, (sheetRef.current?.offsetHeight ?? window.innerHeight) + 40, {
      ...SPRING_DEFAULT,
      // Whatever the sheet was already doing carries into the dismissal
      // instead of being cut to zero — the same velocity handoff the
      // gesture path gets (apple-design §5).
      velocity: y.getVelocity(),
      onComplete: () => {
        settling.current = null
        setClosing(true)
      },
    })
  }, [y])

  useEffect(() => {
    if (dismiss) requestClose()
  }, [dismiss, requestClose])

  // Claims one history entry for as long as this sheet is open, so the back
  // gesture closes it rather than navigating the page out from under it. The
  // pushed entry duplicates the current one (same URL, same router state), so
  // react-router sees no location change going either way — it exists purely
  // as something for `back` to consume.
  useEffect(() => {
    if (!manageHistory) return
    const entry = { close: requestClose }
    // Adopt the entry a sheet that closed in this same commit left behind,
    // rather than pushing a second one on top of it — see orphanedEntries.
    if (orphanedEntries > 0) orphanedEntries--
    else window.history.pushState(window.history.state, '')
    openSheets.push(entry)
    ensureSheetPopListener()
    return () => {
      const i = openSheets.indexOf(entry)
      // Still listed means this sheet closed on its own (save, tap, swipe
      // down) rather than by a back press, so its entry is still on the
      // stack and has to come off. Closed *by* back and it is already gone.
      if (i !== -1) {
        openSheets.splice(i, 1)
        orphanedEntries++
        queueMicrotask(releaseOrphanedEntries)
      }
    }
  }, [manageHistory, requestClose])

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
      const expanding = dy < 0 && (y.get() > 0 || (collapsible && !expandedRef.current))
      if ((dy > 0 && g.canPullDown) || expanding || g.phase === 'dragging') {
        if (event.cancelable) event.preventDefault()
      }
    }
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => node.removeEventListener('touchmove', onTouchMove)
  }, [dragEnabled, y, collapsible])

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragEnabled || event.pointerType === 'mouse') return
    settling.current?.stop()
    settling.current = null
    // A sheet already sliding out can be caught and pulled back — the whole
    // point of stopping the settle above (apple-design §3). Taking back the
    // dismissal is part of that: leaving it set would keep the backdrop
    // faded out under a sheet that is on screen again, and would make every
    // later close request a no-op.
    closeRequested.current = false
    setDismissing(false)
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
      // a larger detent, or (when collapsible) by growing the sheet itself.
      const wantsExpand = dy < 0 && (g.startOffset > 0 || (collapsible && !expandedRef.current))
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
    if (collapsible && !expandedRef.current && dy < 0) {
      const grown = Math.min((peekPx.current ?? 0) - dy, maxSheetHeight())
      height.set(grown)
      return
    }
    // 1:1 within range, progressive resistance past the largest detent.
    const next = g.startOffset + dy
    y.set(next >= 0 ? next : rubberband(next, window.innerHeight * 0.06))
  }

  /**
   * How tall "open" is: the collapsed height plus everything the scrolling
   * middle actually wants. Computed here rather than taken from the caller,
   * because a caller-supplied content height left the docked row out and the
   * sheet shrank on release until only the header showed. `scrollHeight` is
   * the middle's own content, unaffected by however far it is squeezed right
   * now, so this stays correct mid-gesture.
   *
   * `querySelectorAll`, not just the first match: a multi-step sheet (the
   * Mahlzeiten-Editor's input/review carousel) keeps every step mounted at
   * once for the slide transition, and each can tag its own scrolling
   * content `data-sheet-collapse`. Taking the widest of them means whichever
   * step is actually on screen gets the room it asked for, not whichever
   * step happened to be first in the DOM.
   */
  function maxSheetHeight(): number {
    const node = sheetRef.current
    if (!collapsible || peekPx.current == null) {
      return Math.min(node?.scrollHeight ?? window.innerHeight * 0.92, window.innerHeight * 0.92)
    }
    const collapsing = node?.querySelectorAll('[data-sheet-collapse]')
    if (collapsing && collapsing.length > 0) {
      const tallest = Math.max(...[...collapsing].map((el) => el.scrollHeight))
      return Math.min(peekPx.current + tallest, window.innerHeight * 0.92)
    }
    // No `data-sheet-collapse` region exists right now at all — a view that
    // replaced the sheet's *whole* content rather than swapping out just its
    // scrolling middle (the Mahlzeiten-Editor's barcode scanner, its "Supp
    // erkannt" confirmation). There's no docked-row-plus-collapse split to
    // add up here; measure the sheet's own natural height directly instead,
    // the same relax-then-restore the mount-time peek measurement uses two
    // effects up. Safe to do outside a layout effect: this is a read/write
    // pair on a `transform`-adjacent style value with nothing in between
    // that would commit the intermediate 'auto' to a paint.
    if (!node) return window.innerHeight * 0.92
    const previousHeight = height.get()
    height.set('auto')
    const natural = node.scrollHeight
    height.set(previousHeight)
    return Math.min(natural, window.innerHeight * 0.92)
  }

  /**
   * Grows a collapsible sheet to its full height on request — the
   * imperative half of `handlePointerMove`'s drag-up path, for a caller that
   * knows the current view needs the whole sheet without waiting for a drag
   * (see `useSheetExpand`'s own doc comment for why that matters).
   *
   * Idempotent, and a no-op on a sheet that isn't `collapsible` — nothing to
   * expand into. Once set, stays expanded until the user drags it back down
   * past the peek threshold (`settlePeek`) — this never re-collapses it on
   * its own, the same way opening a sheet never auto-closes it. The one
   * accepted gap that leaves: `remeasurePeek` skips its work while expanded
   * (nothing on screen depends on the answer), so if the docked row's own
   * size were to change while expanded and the sheet were then dragged back
   * down, it would settle at a peek height measured before that change. A
   * real cost only in the combination of "expand, then change what the peek
   * row needs, then drag back down without ever seeing peek in between" —
   * narrow enough to accept rather than pay for with a live remeasure that
   * has nothing to render while it's true.
   */
  const expandNow = useCallback(() => {
    if (!collapsible || expandedRef.current) return
    settling.current?.stop()
    expandedRef.current = true
    setExpanded(true)
    settling.current = animate(height, maxSheetHeight(), reducedMotionRef.current ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsible, height])

  /**
   * Release of a peek-height drag: project where the throw was heading
   * (apple-design §6) and settle to whichever end it was actually aimed at,
   * rather than to whichever is nearer at the instant the finger left.
   */
  function settlePeek(velocity: number) {
    const peek = peekPx.current ?? 0
    const current = typeof height.get() === 'number' ? (height.get() as number) : peek
    const full = maxSheetHeight()
    const projected = current - project(velocity)
    const open = projected > peek + (full - peek) * 0.35
    expandedRef.current = open
    setExpanded(open)
    const heightAnim = animate(height, open ? full : peek, {
      ...SPRING_MOMENTUM,
      velocity: -velocity,
      onComplete: () => {
        settling.current = null
        // Deliberately NOT back to `auto`: this sheet's own scrollHeight
        // measures the tallest step of the carousel, not the one on screen,
        // so `auto` opens to a screen of empty space below a one-line field.
        // maxSheetHeight() above is the honest figure and it stays.
      },
    })
    settling.current = heightAnim
    return heightAnim
  }

  /** Snap to the nearest detent, or dismiss if thrown past the smallest one. */
  function settle(velocity: number) {
    if (collapsible && !expandedRef.current) {
      // A downward drag on a still-peeked sheet moves `y`, not `height` (see
      // handlePointerMove's fallthrough) — `settlePeek` below only ever
      // decides peek-vs-expand from `height`, so without this check a drag
      // aimed at dismissing a peeked sheet was silently un-decidable: `y`
      // just sat wherever the finger left it, and the very next
      // `ResizeObserver` tick (fired by settlePeek's own height animation)
      // saw a `y` that no longer matched its measured offset and sprang it
      // straight back to 0. The sheet visually snapped back to exactly
      // where it started — the "I swiped it away and it didn't close" bug.
      // Decide dismissal here first, the same way the expanded path below
      // does, using 0 as "smallest": a peeked sheet has no detents of its
      // own to rest at in `y`, only "not dragged" (0) or "being dragged
      // away".
      const draggedY = y.get()
      if (draggedY > 0 && draggedY + project(velocity) > DISMISS_DISTANCE) {
        closeRequested.current = true
        setDismissing(true)
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
      // Not far/fast enough to dismiss — release `y` back to 0 alongside
      // settlePeek's own (height-based) peek-vs-expand animation. Both run
      // at once (there's nothing to sequence: they animate different
      // properties), so a gesture starting mid-settle needs to stop both —
      // `settling` only holds one handle, so combine them into one.
      if (draggedY !== 0) {
        const yAnim = animate(y, 0, { ...SPRING_MOMENTUM, velocity })
        const heightAnim = settlePeek(velocity)
        settling.current = { stop: () => { yAnim.stop(); heightAnim.stop() } }
      } else {
        settlePeek(velocity)
      }
      return
    }
    const current = y.get()
    const projected = current + project(velocity)
    const smallest = offsets.current[offsets.current.length - 1]

    if (projected > smallest + DISMISS_DISTANCE) {
      // Keep going the way it was thrown (apple-design §8) rather than pulling
      // it back to a symmetric exit — that would read as the interface
      // fighting the user.
      closeRequested.current = true
      setDismissing(true)
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
            animate={{ opacity: dismissing ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_FADE}
            onClick={closeOnBackdropClick ? requestClose : undefined}
          />
          <motion.div
            ref={sheetRef}
            data-sheet-surface=""
            className={`relative ${sheetClassName}`}
            // `height` only participates when the caller asked for a peek —
            // otherwise it stays 'auto' and the sheet sizes itself exactly as
            // it always did.
            style={collapsible ? { y, height, overflow: expanded ? undefined : 'hidden' } : { y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          >
            {/* No `exit` on the content: the sheet leaves by sliding out
                (see requestClose), and an exit fade on top of that would only
                hold the unmount — and with it the caller's onClose — for its
                own duration after the sheet is already off screen. */}
            <motion.div
              className="contents"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
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
                ref={handleRef}
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
              <SheetCloseContext.Provider value={requestClose}>
                <SheetExpandContext.Provider value={expandNow}>{children}</SheetExpandContext.Provider>
              </SheetCloseContext.Provider>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
