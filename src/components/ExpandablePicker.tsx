import { useEffect, useRef, useState, type ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING_SNAPPY } from '../lib/motionTokens'

export interface PickerOption<T extends string> {
  key: T
  label: string
  icon: ComponentType<{ className?: string }>
}

/**
 * A collapsed pill that expands into a full segmented row on touch — the
 * same device the iOS Camera app uses for its Foto/Video/Porträt mode
 * dial: collapsed, it shows only the current value; touching it reveals
 * every option as a horizontal row, and either tapping one directly or
 * dragging across the row (without lifting the finger) picks a new value
 * and collapses back to a single pill showing it.
 *
 * Round 4 (v2.4), a bigger overhaul than earlier rounds' tuning:
 *
 * - **Constant footprint.** Earlier rounds resized the outer shape between
 *   collapsed and expanded via Framer's `layout` prop — explicit feedback
 *   this still read as the tile "changing size". Fixed instead by giving
 *   the collapsed single button and each expanded row button the exact same
 *   height (`py-3`) inside a container that's always `w-full`: a single
 *   full-width button and N `flex-1` buttons summing to full width occupy
 *   the identical box, so there is nothing left to animate between them —
 *   no `layout`, no resize, ever.
 * - **Icons, not words**, on every option (see PickerIcons.tsx) — the
 *   collapsed pill keeps a short text label alongside its icon (nothing
 *   else identifies which single value is showing), but the expanded row's
 *   per-option buttons are icon-only, with the label kept for
 *   screen readers (`sr-only`) and the row's own `aria-label`.
 * - **Selected option always centered when expanded.** The options are
 *   reordered (rotated) around the current value before rendering, not
 *   just reordered once — it re-centers on every change. Each button keeps
 *   its option key as its React key, so Framer's `layout` on the individual
 *   buttons (not the container) animates the shuffle as a smooth reflow
 *   instead of a cut.
 *
 * The drag-across-the-row gesture from earlier rounds is preserved, just
 * operating on the reordered (display) list — `indexFromClientX` returns a
 * *display* slot, mapped back to the real option via the same rotation.
 */
export function ExpandablePicker<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: PickerOption<T>[]
  value: T
  onChange: (key: T) => void
  /** Accessible name for the control as a whole (e.g. "Zeitraum", "Ansicht"). */
  label: string
}) {
  const [expanded, setExpanded] = useState(false)
  // Live highlight while a pointer is down and moving across the row —
  // separate from `value` itself, which only actually changes on release,
  // so an aborted drag (pointercancel) never commits a value it merely
  // previewed.
  const [liveSlot, setLiveSlot] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const prefersReducedMotion = useReducedMotion()

  const n = options.length
  const currentIndex = Math.max(0, options.findIndex((o) => o.key === value))
  // The slot the current value should sit in — as close to the row's
  // middle as an even count allows (a left-of-center bias for 4 options).
  const centerSlot = Math.floor((n - 1) / 2)
  // Rotates `options` so `currentIndex` lands on `centerSlot`. `display[j]`
  // is the option shown in slot j; `slotOf(i)` inverts that for a given
  // original index.
  const display = Array.from({ length: n }, (_, slot) => options[(currentIndex - centerSlot + slot + n) % n])
  const slotOf = (index: number) => (index - currentIndex + centerSlot + n) % n
  const highlightSlot = liveSlot ?? centerSlot

  // Collapses on any tap outside the control — the same "outside tap
  // dismisses" behavior every other transient popover in the app uses.
  useEffect(() => {
    if (!expanded) return
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [expanded])

  /** Which display slot a given absolute X sits over, clamped to the row's own bounds. */
  function slotFromClientX(clientX: number): number {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return centerSlot
    const relativeX = clientX - rect.left
    const stepWidth = rect.width / n
    return Math.max(0, Math.min(n - 1, Math.floor(relativeX / stepWidth)))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    containerRef.current?.setPointerCapture(e.pointerId)
    setLiveSlot(slotFromClientX(e.clientX))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    setLiveSlot(slotFromClientX(e.clientX))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    const slot = slotFromClientX(e.clientX)
    setLiveSlot(null)
    onChange(display[slot].key)
    setExpanded(false)
  }

  function handlePointerCancel() {
    draggingRef.current = false
    setLiveSlot(null)
  }

  const CurrentIcon = options[currentIndex]?.icon

  return (
    <div className="mb-5 flex justify-center">
      <div className="glass w-full overflow-hidden rounded-full p-1.5 shadow-sm shadow-black/5">
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={label}
            className="flex w-full items-center justify-center gap-2 rounded-full py-3 font-display text-sm font-semibold text-ink"
          >
            {CurrentIcon && <CurrentIcon className="h-4 w-4" />}
            {options[currentIndex]?.label}
          </button>
        ) : (
          <div
            ref={containerRef}
            role="tablist"
            aria-label={label}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className="flex touch-none gap-1.5"
          >
            {display.map((o) => {
              const slot = slotOf(options.findIndex((opt) => opt.key === o.key))
              const Icon = o.icon
              return (
                <motion.button
                  key={o.key}
                  layout
                  transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
                  type="button"
                  role="tab"
                  aria-selected={o.key === value}
                  aria-label={o.label}
                  // Only reachable via keyboard/assistive activation now — the
                  // pointer path above (down/move/up on the row itself) already
                  // handles a plain tap the same way it handles a drag, since a
                  // tap is just a drag with zero distance.
                  onClick={() => {
                    onChange(o.key)
                    setExpanded(false)
                  }}
                  className="relative flex-1 rounded-full py-3 font-display text-sm font-medium transition-colors"
                >
                  {slot === highlightSlot && (
                    <motion.span
                      layoutId="expandable-picker-pill"
                      className="absolute inset-0 rounded-full bg-section-20"
                      transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
                    />
                  )}
                  <span className={`relative z-10 flex items-center justify-center ${slot === highlightSlot ? 'text-section' : 'text-ink-soft'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="sr-only">{o.label}</span>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
