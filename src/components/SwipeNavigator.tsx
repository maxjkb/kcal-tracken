import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { SECTION_TABS, sectionIndexForPath } from '../lib/sections'
import { useSwipeProgress } from '../hooks/useSwipeProgress'
import { BackSwipeContext, type BackHandlerRegistry } from '../lib/backSwipe'
import { SPRING_DEFAULT, SPRING_MOMENTUM } from '../lib/motionTokens'
import { SectionPreview } from './SectionPreview'
import { preloadSection } from '../lib/preloadSection'

/** Movement before we commit to calling a gesture horizontal rather than a scroll. */
const DIRECTION_LOCK_PX = 8
/** How much more horizontal than vertical a gesture must be to count as a swipe. */
const HORIZONTAL_BIAS = 1
/** Fraction of the viewport the projected endpoint must pass to change page. */
const COMMIT_FRACTION = 0.22
/**
 * How long the outgoing preview stays on screen, masking the destination
 * route's own fresh mount, after a committed swipe (see `endGesture`'s
 * `onComplete`). Measured (repro-swipe-flash2.mjs): a freshly-mounted
 * section's own data — Dexie's `useLiveQuery` always resolves at least one
 * tick after mount, even against a small, local, already-warm database —
 * took ~30-60ms to go from its empty first render to its populated one.
 * 120ms is comfortable margin over that measured worst case without being
 * long enough to itself read as a pause.
 */
const SWIPE_HOLDOVER_MS = 120

/** Apple's scroll-deceleration projection — where a flick would come to rest. 0.99 rather than the free-scroll 0.998, so distance still matters for a discrete page commit. */
function project(velocity: number, decelerationRate = 0.99): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance at the ends of the list, where there is nothing to move to. */
function rubberband(offset: number, dimension: number, constant = 0.55): number {
  return (offset * dimension * constant) / (dimension + constant * Math.abs(offset))
}

/**
 * Horizontal swipe navigation between the four main areas, in the order
 * lib/sections.ts defines (Rezepte → Supplements → Feed → Statistik). Finger
 * left moves forward, finger right moves back.
 *
 * Rewritten to follow the finger properly (apple-design §2, §3, §5):
 *
 * - **1:1 tracking with the real neighbour on screen.** Once a gesture locks
 *   horizontal, the adjacent page is mounted just off-screen and the pair
 *   moves with the finger at full scale — not the damped nudge this used to
 *   do. That nudge existed only to avoid dragging an empty viewport into
 *   view, which is a reason to render the neighbour, not to fake the motion.
 *   Mounting on direction-lock rather than on every touch keeps the cost to
 *   one mount per real gesture, and the chunk is already warm (see
 *   preloadSection).
 * - **Velocity handoff.** The release velocity is passed into the settling
 *   spring, so there is no seam between dragging and animating.
 * - **Interruptible.** The gesture can be grabbed and reversed at any point;
 *   nothing locks input while the page settles.
 *
 * The commit swap happens at the moment the outgoing page is exactly one
 * viewport away, which is precisely where the incoming page already sits — so
 * the route change is invisible.
 *
 * `touch-action: pan-y` hands vertical scrolling to the browser while
 * reserving the horizontal axis. Opt a subtree out with `data-no-swipe`;
 * native horizontal controls (a range slider) are skipped automatically.
 */
export function SwipeNavigator({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()

  const index = sectionIndexForPath(location.pathname)
  const inSection = index !== -1

  const x = useMotionValue(0)
  // Fractional index shared with the bottom nav, so the selection pill travels
  // with the page rather than alongside it. Provided from above (App) because
  // the nav is this component's sibling, not its child.
  const shared = useSwipeProgress()
  const local = useMotionValue(index === -1 ? 0 : index)
  const progress = shared ?? local

  /** Which neighbour is mounted during a gesture, and on which side. */
  const [preview, setPreview] = useState<{ index: number; direction: 1 | -1 } | null>(null)

  /**
   * The settle/commit animation in flight, so a new gesture can stop it.
   *
   * `MotionValue.set()` does not cancel a running animation — the spring keeps
   * overwriting the value on the next frame. Without this, grabbing the page
   * back mid-flick did nothing, and the old animation's onComplete still
   * navigated to the section the user was actively cancelling. apple-design
   * §3: every animation must be interruptible and redirectable.
   */
  const settling = useRef<{ stop: () => void } | null>(null)

  /**
   * The commit-hold timer (see `onComplete` in `endGesture` below) — kept in
   * a ref for the same reason `settling` is: a new gesture starting before
   * it fires must be able to cancel it. Left to run, a stale timer from a
   * swipe two gestures ago would reset `x`/`preview` out from under
   * whatever the CURRENT gesture is actively doing.
   */
  const holdTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  const gesture = useRef<{
    startX: number
    startY: number
    lastX: number
    lastTime: number
    velocity: number
    axis: 'undecided' | 'horizontal' | 'abandoned'
    pointerId: number
    width: number
    previewIndex: number | null
  } | null>(null)

  // Keep the shared progress in step with the route whenever it changes for a
  // reason other than a drag — a tap on the nav, a link, the back button.
  useEffect(() => {
    if (!inSection) return
    if (gesture.current?.axis === 'horizontal') return
    const settle = animate(progress, index, prefersReducedMotion ? { duration: 0 } : SPRING_DEFAULT)
    return () => settle.stop()
  }, [index, inSection, progress, prefersReducedMotion])

  // Warm the adjacent routes' lazy chunks while the app is idle. Without this
  // the first swipe toward Statistik or Rezepte had to fetch a chunk mid-
  // gesture, which is exactly when there is no time for it.
  useEffect(() => {
    if (!inSection) return
    // All of them, not just the neighbours. There are four, they are small,
    // and a chunk that arrives mid-swipe replaces the page being dragged into
    // view with a "Lädt…" fallback — the transition visibly breaking apart is
    // exactly the "wird durch Nachladen unterbrochen" complaint. Fetching the
    // far ones too costs one extra idle request and removes the interruption
    // for every direction, including a tap straight to the far tab.
    const warm = () => SECTION_TABS.forEach((tab) => preloadSection(tab.to))
    // Schedule and cancel have to come from the SAME mechanism. They didn't:
    // the scheduler fell back to setTimeout where requestIdleCallback is
    // missing, but the cleanup only ever called cancelIdleCallback — which is
    // undefined in exactly that case, so the optional call short-circuited and
    // cancelled nothing. On iOS Safari, which is what this app actually runs
    // on, the cleanup was therefore a no-op and the warm-up fired after
    // unmount every time.
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(warm)
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(warm, 300)
    return () => window.clearTimeout(id)
  }, [index, inSection])

  // A page that has its own "back" (a recipe detail, a settings sub-page)
  // claims the right-swipe, so the gesture means what its back arrow means
  // rather than running into the end of the section list.
  const backHandler = useRef<(() => void) | null>(null)
  // Built once via a useState initializer rather than read off a ref during
  // render: the object identity has to be stable (it's a context value), and
  // reading `.current` in the render body is exactly what it isn't for.
  const [backRegistry] = useState<BackHandlerRegistry>(() => ({
    set: (handler) => {
      backHandler.current = handler
    },
    get: () => backHandler.current,
  }))

  // SwipeNavigator wraps every routed page, so it never actually unmounts
  // in normal use — this is a safety net (StrictMode's double-invoke, a
  // future refactor) against a hold timer outliving the component and
  // firing into motion values nothing reads any more.
  useEffect(() => {
    return () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    }
  }, [])

  const clearGesture = useCallback(() => {
    gesture.current = null
    setPreview(null)
  }, [])

  function handlePointerDown(event: React.PointerEvent) {
    // Mouse excluded on purpose: a click-drag across a desktop page is a text
    // selection, not a navigation gesture.
    if (event.pointerType === 'mouse') return
    // Outside the four areas (the settings tree) there is no section to swipe
    // to — but a page there may still have registered a back action, and that
    // gesture has to keep working.
    if (!inSection && !backHandler.current) return
    const target = event.target as HTMLElement
    if (target.closest('input[type="range"], [data-no-swipe]')) return
    // Stop whatever is still settling. Without this the ref was assigned three
    // times and never read: a spring mid-commit kept overwriting `x` every
    // frame, so the page didn't follow the finger that was cancelling it, and
    // its onComplete still navigated to the section being cancelled. Sheet.tsx
    // has always done this; here it was written down and not wired up.
    settling.current?.stop()
    settling.current = null
    // A pending commit-hold from the previous swipe (see endGesture's
    // onComplete) has already done its job the moment a new gesture starts
    // — this one owns `x`/`preview` now. Left to fire later it would reset
    // both out from under whatever this new gesture is doing.
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      axis: 'undecided',
      pointerId: event.pointerId,
      width: window.innerWidth,
      previewIndex: null,
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId || g.axis === 'abandoned') return

    const dx = event.clientX - g.startX
    const dy = event.clientY - g.startY

    if (g.axis === 'undecided') {
      if (Math.abs(dy) > DIRECTION_LOCK_PX && Math.abs(dy) >= Math.abs(dx)) {
        g.axis = 'abandoned'
        return
      }
      if (Math.abs(dx) > DIRECTION_LOCK_PX && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS) {
        g.axis = 'horizontal'
        // Capture the pointer so tracking survives the finger leaving this
        // element — otherwise a drag that strays over the bottom nav stops
        // reporting halfway through, which is what made swiping back and
        // forth feel like it only worked sometimes.
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      } else {
        return
      }
    }

    const dt = event.timeStamp - g.lastTime
    if (dt > 0) g.velocity = ((event.clientX - g.lastX) / dt) * 1000
    g.lastX = event.clientX
    g.lastTime = event.timeStamp

    // dx < 0 is forward through SECTION_TABS (finger left), dx > 0 is back.
    const direction: 1 | -1 = dx < 0 ? 1 : -1
    const claimsBack = direction === -1 && backHandler.current !== null
    const targetIndex = index + direction
    const hasNeighbour = inSection && !claimsBack && targetIndex >= 0 && targetIndex < SECTION_TABS.length

    if (hasNeighbour && g.previewIndex !== targetIndex) {
      g.previewIndex = targetIndex
      setPreview({ index: targetIndex, direction })
    }

    // Full 1:1 travel where there is somewhere to go; progressive resistance
    // where there isn't (apple-design §9 — a hard stop reads as frozen).
    const offset = hasNeighbour ? dx : rubberband(dx, g.width * 0.12)
    if (!prefersReducedMotion) x.set(offset)
    if (inSection) progress.set(index - offset / g.width)
  }

  function endGesture(event: React.PointerEvent) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    if (g.axis !== 'horizontal') {
      clearGesture()
      return
    }

    const dx = event.clientX - g.startX

    // A page-level back beats section navigation when both could apply.
    if (dx > 0 && backHandler.current) {
      const back = backHandler.current
      const wentFarEnough = dx > g.width * COMMIT_FRACTION || g.velocity > 500
      gesture.current = null
      settling.current = animate(x, 0, { ...SPRING_MOMENTUM, velocity: g.velocity })
      if (inSection) animate(progress, index, SPRING_DEFAULT)
      setPreview(null)
      if (wentFarEnough) back()
      return
    }

    // Decide on where the flick would come to rest, clamped so velocity can
    // carry a short drag over the line without making distance irrelevant.
    const assist = Math.max(-g.width / 2, Math.min(g.width / 2, project(g.velocity)))
    const projected = dx + assist
    const threshold = g.width * COMMIT_FRACTION
    const target = projected < -threshold ? index + 1 : projected > threshold ? index - 1 : index
    const commits = inSection && target !== index && target >= 0 && target < SECTION_TABS.length

    gesture.current = null

    if (!commits) {
      // Hand the release velocity to the spring so there's no seam between
      // dragging and settling.
      settling.current = animate(x, 0, { ...SPRING_MOMENTUM, velocity: g.velocity })
      animate(progress, index, { ...SPRING_MOMENTUM, velocity: -g.velocity / g.width })
      setPreview(null)
      return
    }

    const direction = target > index ? 1 : -1
    const destination = -direction * g.width
    animate(progress, target, { ...SPRING_DEFAULT, velocity: -g.velocity / g.width })
    settling.current = animate(x, destination, {
      ...SPRING_DEFAULT,
      velocity: g.velocity,
      onComplete: () => {
        settling.current = null
        // Swap only once the outgoing page is exactly one viewport away, which
        // is where the incoming one already sits — so the route change lands
        // on an identical frame and is invisible... at the position, that is.
        // The CONTENT wasn't: `navigate()` mounts the real destination route
        // fresh, and a fresh mount's own data (useLiveQuery et al.) starts
        // from nothing — measured (repro-swipe-flash2.mjs) as a real, visible
        // dip in rendered content right at this exact moment, the "kann ich
        // sehen, wie sich die Seite neu laden muss" report.
        //
        // `x` and the preview are deliberately NOT reset here, only after a
        // short hold. Until then, `x` stays at `destination` — a no-op frame
        // to frame, since that's already where it visually is — which keeps
        // BOTH halves exactly where they already were the instant before
        // this callback ran: the fresh (currently data-less) real route,
        // now `{children}`, stays carried one viewport off-screen by that
        // unchanged `x`; the preview — still the SAME already-fully-loaded
        // component instance the whole drag rendered, never remounted —
        // stays sitting exactly on screen, its own `left:±100%` offset
        // still cancelling `x` out the same way it did a moment ago. The
        // user keeps looking at settled, populated content throughout;
        // only what's hidden behind it changes. Once the hold elapses the
        // real route has had time to load, and snapping `x` to 0 swaps
        // which half is on screen without anything having visibly moved.
        navigate(SECTION_TABS[target].to)
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null
          x.set(0)
          setPreview(null)
        }, SWIPE_HOLDOVER_MS)
      },
    })
  }

  return (
    <BackSwipeContext.Provider value={backRegistry}>
      <div
        className="relative min-h-screen overflow-x-clip"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <motion.div style={{ x }}>
          {children}
          {preview && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-full"
              style={{ left: preview.direction === 1 ? '100%' : '-100%' }}
            >
              <SectionPreview to={SECTION_TABS[preview.index].to} />
            </div>
          )}
        </motion.div>
      </div>
    </BackSwipeContext.Provider>
  )
}
