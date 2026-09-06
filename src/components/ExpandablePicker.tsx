import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING_SNAPPY } from '../lib/motionTokens'

export interface PickerOption<T extends string> {
  key: T
  label: string
}

/**
 * A collapsed pill that expands into a full segmented row on touch — the
 * same device the iOS Camera app uses for its Foto/Video/Porträt mode
 * dial: collapsed, it shows only the current value; touching it reveals
 * every option as a horizontal row, and either tapping one directly or
 * dragging across the row (without lifting the finger) picks a new value
 * and collapses back to a single pill showing it.
 *
 * Global brainstorm round (v2.1): replaces the always-fully-expanded
 * segmented control Supps and Statistik used to show permanently at the
 * top of the page — explicit request was to default to showing only the
 * current value ("Heute" / "Woche") and reveal the rest only on demand.
 *
 * The drag here reads pointer position, not full physics: every move and
 * the final release resolve to whichever option's slot the pointer is
 * over (by absolute X within the row), highlighted live as the finger
 * travels and committed on release — not a momentum/rubber-band
 * recreation of the Camera app's actual dial. That covers what was asked
 * ("durch Wischen der Pille kann ich dies dann auswählen") without the
 * much larger engineering lift a physically-accurate port would take.
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
    const stepWidth = rect.width / options.length
    return Math.max(0, Math.min(options.length - 1, Math.floor(relativeX / stepWidth)))
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

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={label}
        className="glass-subtle glass-subtle-themed mb-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-ink shadow-sm shadow-black/5"
      >
        {options[currentIndex]?.label}
        <ChevronsIcon />
      </button>
    )
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      // Full .glass, not .glass-subtle — a segmented control is navigation
      // the same way BottomNav is, so it gets the same material (matches
      // what this replaced).
      className="glass mb-5 flex touch-none gap-1.5 rounded-full p-1.5 shadow-sm shadow-black/5"
    >
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={i === currentIndex}
          // Only reachable via keyboard/assistive activation now — the
          // pointer path above (down/move/up on the row itself) already
          // handles a plain tap the same way it handles a drag, since a
          // tap is just a drag with zero distance.
          onClick={() => {
            onChange(o.key)
            setExpanded(false)
          }}
          className={`relative flex-1 rounded-full py-3 text-sm font-medium transition-colors ${
            i === highlightIndex ? 'text-ink' : 'text-ink-soft'
          }`}
        >
          {i === highlightIndex && (
            <motion.span
              layoutId="expandable-picker-pill"
              className="absolute inset-0 rounded-full bg-section-20"
              transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
            />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function ChevronsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 opacity-60">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  )
}
