import { useEffect, useRef, useState, type ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING_DEFAULT, SPRING_SNAPPY } from '../lib/motionTokens'

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
 * Round 6 (v2.6) reverses two Round 4 decisions, on explicit feedback:
 *
 * - **Fixed order, no re-centering.** Round 4 rotated the options so the
 *   current value always landed in the middle slot when expanded. That
 *   made the row's layout depend on which option was selected — the same
 *   tab could sit in a different physical position from one open to the
 *   next, which read as unpredictable rather than helpful. Options now
 *   render in the order the caller passed them, always, full stop.
 * - **Animated resize instead of a fixed footprint.** Round 4 also forced
 *   the collapsed pill and the expanded row into an identical box (both
 *   `w-full`, same button height) specifically so nothing had to animate
 *   between them. Reintroducing a real height/width change between states
 *   read better once it was actually animated smoothly — `layout` on the
 *   outer container (a plain resize, not a bounce) rather than a jump cut.
 *
 * Icons instead of words (the collapsed pill still keeps a short label
 * alongside its icon; the expanded row is icon-only, with `sr-only` labels)
 * stay from Round 4 — that part held up.
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
  const [liveIndex, setLiveIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const prefersReducedMotion = useReducedMotion()

  const n = options.length
  const currentIndex = Math.max(0, options.findIndex((o) => o.key === value))
  const highlightIndex = liveIndex ?? currentIndex

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

  /** Which option's slot a given absolute X sits over, clamped to the row's own bounds. */
  function indexFromClientX(clientX: number): number {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return currentIndex
    const relativeX = clientX - rect.left
    const stepWidth = rect.width / n
    return Math.max(0, Math.min(n - 1, Math.floor(relativeX / stepWidth)))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    containerRef.current?.setPointerCapture(e.pointerId)
    setLiveIndex(indexFromClientX(e.clientX))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    setLiveIndex(indexFromClientX(e.clientX))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    const index = indexFromClientX(e.clientX)
    setLiveIndex(null)
    onChange(options[index].key)
    setExpanded(false)
  }

  function handlePointerCancel() {
    draggingRef.current = false
    setLiveIndex(null)
  }

  const CurrentIcon = options[currentIndex]?.icon

  return (
    <div className="mb-5 flex justify-center">
      <motion.div
        layout
        transition={prefersReducedMotion ? { duration: 0 } : SPRING_DEFAULT}
        className="glass w-full overflow-hidden rounded-full p-1.5 shadow-sm shadow-black/5"
      >
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
            {options.map((o, i) => (
              <button
                key={o.key}
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
                {i === highlightIndex && (
                  <motion.span
                    layoutId="expandable-picker-pill"
                    className="absolute inset-0 rounded-full bg-section-20"
                    transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
                  />
                )}
                <span className={`relative z-10 flex items-center justify-center ${i === highlightIndex ? 'text-section' : 'text-ink-soft'}`}>
                  <o.icon className="h-4 w-4" />
                </span>
                <span className="sr-only">{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
