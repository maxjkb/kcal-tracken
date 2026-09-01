import { useRef } from 'react'

/** Rightward movement before a touch counts as a back gesture. */
const INTENT_PX = 12
/** How much more horizontal than vertical it has to be. */
const HORIZONTAL_BIAS = 1.2
/** Distance that commits on its own, without a flick. */
const COMMIT_PX = 70
/** Flick speed that commits a shorter drag. */
const COMMIT_VELOCITY = 500

/**
 * "Swipe right to go back", for any view that already has a back control.
 *
 * Wherever there's a back arrow there should be a back gesture: the button is
 * the discoverable affordance, the swipe is the one people reach for. Used by
 * the views that go back *within* a sheet (the meal editor's recipe picker,
 * both editors' second step, the month/year pickers) — sheets portal outside
 * the app's page-level swipe navigator, so they need their own recogniser
 * rather than being able to defer to it.
 *
 * Deliberately conservative about what counts: a clear horizontal move that
 * out-runs any vertical component, so it never fires while someone is
 * scrolling the sheet or dragging it down to dismiss. Pass `null` to disable
 * (there is nothing to go back to), which keeps the hook call unconditional.
 *
 * `onForward` is for the places whose back arrow has a matching forward one —
 * the date pickers' previous/next month — where a left-swipe is just as
 * obviously "the other arrow" as a right-swipe is "back".
 */
export function useSwipeBack(onBack: (() => void) | null, onForward?: (() => void) | null) {
  const gesture = useRef<{ x: number; y: number; lastX: number; lastTime: number; velocity: number; pointerId: number; done: boolean } | null>(null)

  return {
    onPointerDown(event: React.PointerEvent) {
      if ((!onBack && !onForward) || event.pointerType === 'mouse') return
      const target = event.target as HTMLElement
      // Only genuinely drag-operated controls are excluded. Carving out every
      // text field would gut the gesture where it's needed most: the editors'
      // second step is almost entirely inputs, so "swipe right to go back"
      // would have worked nowhere on the screen it belongs to. On mobile a
      // horizontal drag over a field isn't a selection gesture anyway —
      // selection goes through long-press and handles.
      if (target.closest('input[type="range"], select, [data-no-swipe]')) return
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        pointerId: event.pointerId,
        done: false,
      }
    },
    onPointerMove(event: React.PointerEvent) {
      const g = gesture.current
      if (!g || g.done || g.pointerId !== event.pointerId) return
      // Claim this pointer for as long as this gesture is still being
      // decided or actively tracked. Every caller of this hook lives inside
      // a Sheet, whose own drag-to-dismiss recogniser listens on an
      // ancestor of wherever these handlers are attached — and once that
      // recogniser calls `setPointerCapture` (which it does the moment its
      // own vertical/horizontal split leans vertical enough), the browser
      // retargets every later pointer event on this pointerId to it, so a
      // nested listener like this one would stop receiving events entirely.
      // A real thumb rarely swipes perfectly horizontal from the first
      // pixel — without this, that ordinary wobble could hand a "swipe
      // right to go back" straight to the sheet's own drag instead, which
      // is exactly the "only very specific gestures register" complaint
      // this fixes. Once this gesture is `done` (below), propagation is no
      // longer stopped and the sheet gets the rest of it as normal.
      event.stopPropagation()
      const dx = event.clientX - g.x
      const dy = event.clientY - g.y

      // A vertical move settles it once — no second guess partway through, so
      // a scroll can never become a navigation.
      if (Math.abs(dy) > Math.abs(dx) * HORIZONTAL_BIAS) {
        g.done = true
        return
      }
      // A leftward move only matters where there's a forward action to reach.
      if (dx < -INTENT_PX && !onForward) {
        g.done = true
        return
      }
      const dt = event.timeStamp - g.lastTime
      if (dt > 0) g.velocity = ((event.clientX - g.lastX) / dt) * 1000
      g.lastX = event.clientX
      g.lastTime = event.timeStamp

      const committed = Math.abs(dx) > COMMIT_PX || (Math.abs(dx) > INTENT_PX && Math.abs(g.velocity) > COMMIT_VELOCITY)
      if (!committed) return
      g.done = true
      if (dx > 0) onBack?.()
      else onForward?.()
    },
    onPointerUp() {
      gesture.current = null
    },
    onPointerCancel() {
      gesture.current = null
    },
  }
}
