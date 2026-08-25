import { useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { SECTION_TABS, sectionIndexForPath } from '../lib/sections'
import { SPRING_DEFAULT, SPRING_MOMENTUM } from '../lib/motionTokens'

/** Movement before we commit to calling a gesture horizontal rather than a scroll. */
const DIRECTION_LOCK_PX = 12
/** How much more horizontal than vertical a gesture must be to count as a swipe. */
const HORIZONTAL_BIAS = 1.2
/** Fraction of the viewport the projected endpoint must pass to change page. */
const COMMIT_FRACTION = 0.28
/** Cap on how far the page visually gives — a hint that the gesture registered, not a page that leaves. */
const GIVE_FRACTION = 0.16

/**
 * Apple's scroll-deceleration projection (Designing Fluid Interfaces) — where a
 * flick would come to rest.
 *
 * 0.99 rather than the 0.998 that matches free scrolling: 0.998 multiplies
 * velocity by ~500, which for a *discrete* page commit means any quick twitch
 * projects several viewports away and flips the page regardless of how far the
 * finger actually travelled. The snappier rate keeps the physical model —
 * a fast flick still carries further than a slow drag of the same length —
 * while leaving distance a real part of the decision.
 */
function project(velocity: number, decelerationRate = 0.99): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance: follows the finger at first, asymptotically approaching `dimension`. */
function rubberband(offset: number, dimension: number, constant = 0.55): number {
  return (offset * dimension * constant) / (dimension + constant * Math.abs(offset))
}

/**
 * App-wide horizontal swipe navigation between the four main areas, in the
 * order lib/sections.ts defines (Rezepte → Supplements → Feed → Statistik).
 * Finger left moves forward, finger right moves back — the direction iOS uses,
 * where the content follows the finger rather than the finger pointing at a
 * button.
 *
 * Three things make it read as a gesture rather than a shortcut key:
 *
 * - **Direction lock.** Nothing happens until the gesture has moved
 *   DIRECTION_LOCK_PX and is clearly more horizontal than vertical. Until then
 *   it's still a candidate scroll, and a scroll that drifts sideways must never
 *   turn into a page change. Once locked vertical the gesture is abandoned
 *   outright — no second guess partway through.
 * - **Continuous feedback.** While locked horizontal the page follows the
 *   finger, rubber-banded to a small fraction of the viewport (and much harder
 *   at the ends of the list, where there is nothing to move to). It reads as
 *   the page giving under the gesture rather than sliding away: a full-width
 *   drag would need the neighbouring page rendered underneath to avoid pulling
 *   a blank viewport into view, which would mean mounting Statistik's charts on
 *   every stray touch.
 * - **Momentum projection.** The commit decision uses where the flick would
 *   *come to rest*, not where the finger let go, so a short fast flick carries
 *   as far as a long slow drag.
 *
 * `touch-action: pan-y` hands vertical scrolling to the browser (native
 * momentum, no jank) while reserving the horizontal axis for us — which also
 * stops Safari's own back/forward overscroll from fighting the gesture.
 *
 * Opt a subtree out with `data-no-swipe`; native horizontal controls (a range
 * slider) are skipped automatically. Sheets are unaffected either way — they
 * portal to <body>, outside this subtree, so their own drag never competes.
 */
export function SwipeNavigator({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const x = useMotionValue(0)

  const index = sectionIndexForPath(location.pathname)
  const enabled = index !== -1

  // Direction of the last area change, so the incoming page enters from the
  // side it came from (spatial consistency: what left rightwards comes back
  // from the right). Derived by adjusting state during render — React's
  // documented pattern for reacting to a changed value — because the direction
  // is only ever needed on the render where the keyed child below mounts and
  // reads its `initial`.
  const [previousIndex, setPreviousIndex] = useState(index)
  let enterDirection = 0
  if (previousIndex !== index) {
    if (index !== -1 && previousIndex !== -1) enterDirection = Math.sign(index - previousIndex)
    setPreviousIndex(index)
  }

  const gesture = useRef<{
    startX: number
    startY: number
    lastX: number
    lastTime: number
    velocity: number
    axis: 'undecided' | 'horizontal' | 'abandoned'
    pointerId: number
  } | null>(null)

  function handlePointerDown(event: React.PointerEvent) {
    // Mouse excluded on purpose: a click-drag across a desktop page is a text
    // selection, not a navigation gesture.
    if (!enabled || event.pointerType === 'mouse') return
    const target = event.target as HTMLElement
    if (target.closest('input[type="range"], [data-no-swipe]')) return
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      axis: 'undecided',
      pointerId: event.pointerId,
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
      } else {
        return
      }
    }

    // Velocity from the latest move pair rather than the whole gesture, so a
    // flick at the end of a slow drag still reads as a flick.
    const dt = event.timeStamp - g.lastTime
    if (dt > 0) g.velocity = ((event.clientX - g.lastX) / dt) * 1000
    g.lastX = event.clientX
    g.lastTime = event.timeStamp

    if (prefersReducedMotion) return

    const width = window.innerWidth
    // dx < 0 is forward through SECTION_TABS (finger left), dx > 0 is back.
    const atEnd = (dx < 0 && index === SECTION_TABS.length - 1) || (dx > 0 && index === 0)
    const give = width * (atEnd ? GIVE_FRACTION / 3 : GIVE_FRACTION)
    x.set(rubberband(dx, give))
  }

  function endGesture(event: React.PointerEvent) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    gesture.current = null
    if (g.axis !== 'horizontal') return

    const dx = event.clientX - g.startX
    // Decide on the raw finger travel, not the damped visual offset — the
    // rubber-banding is a display choice and shouldn't move the commit line.
    // Velocity is clamped to half a viewport of assist so a flick can carry a
    // short drag over the line, but can never make the distance irrelevant.
    const assist = Math.max(-window.innerWidth / 2, Math.min(window.innerWidth / 2, project(g.velocity)))
    const projected = dx + assist
    const threshold = window.innerWidth * COMMIT_FRACTION
    const target = projected < -threshold ? index + 1 : projected > threshold ? index - 1 : index

    if (target !== index && target >= 0 && target < SECTION_TABS.length) {
      // Reset before navigating: the incoming page runs its own entry
      // animation from the edge, and a leftover give offset would fight it.
      x.set(0)
      navigate(SECTION_TABS[target].to)
      return
    }
    animate(x, 0, SPRING_MOMENTUM)
  }

  return (
    <motion.div
      style={{ x, touchAction: enabled ? 'pan-y' : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {/* Keyed on the area rather than the exact path: drilling into a recipe
          stays within Rezepte and keeps its own SlideInPage transition, while
          moving between areas re-runs this entry animation. */}
      <motion.div
        key={index === -1 ? 'other' : SECTION_TABS[index].to}
        initial={prefersReducedMotion || enterDirection === 0 ? false : { x: enterDirection * 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={SPRING_DEFAULT}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
