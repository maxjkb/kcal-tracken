import { useRef, useState } from 'react'
import { toggleSickDay, useSickDay } from '../lib/illness'
import { SickDaySheet } from './SickDaySheet'

/** How long a press has to hold before it reads as a long-press rather than a tap. */
const LONG_PRESS_MS = 500

/**
 * Sick-day marker for the Feed header — takes the UI slot the "Tipps für
 * jetzt" lightbulb used to occupy (explicit feedback: that feature was never
 * used, this is a better use of the spot). Only rendered for today, same as
 * the button it replaced.
 *
 * Interaction model, per an explicit product spec:
 * - A quick tap instantly toggles the day on/off — the button fills solid
 *   the moment it's on, no sheet, no confirmation.
 * - The very FIRST time a day is marked (no row exists yet) that same tap
 *   also opens the detail Sheet, since there's nothing to show yet without
 *   it — a bare "on" with zero context isn't a useful first state.
 * - A long-press always opens the detail Sheet, regardless of current
 *   state, to add/edit the illness category, a note, and (there) trigger
 *   the on-request AI target suggestion.
 */
export function SickDayButton({ dateKey }: { dateKey: string }) {
  const sickDay = useSickDay(dateKey)
  const [sheetOpen, setSheetOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const isMarked = Boolean(sickDay)

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function handlePointerDown() {
    longPressFiredRef.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      setSheetOpen(true)
    }, LONG_PRESS_MS)
  }

  async function handlePointerUp() {
    clearTimer()
    if (longPressFiredRef.current) return // the timer already opened the Sheet
    const wasUnmarked = sickDay === null
    const nowMarked = await toggleSickDay(dateKey)
    if (nowMarked && wasUnmarked) setSheetOpen(true) // first-ever activation for this day
  }

  function handlePointerCancel() {
    clearTimer()
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={isMarked ? 'Als krank markiert — antippen zum Entfernen, halten zum Bearbeiten' : 'Als krank markieren'}
        title="Krank"
        className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm shadow-black/5 transition active:scale-95 ${
          isMarked ? 'bg-danger text-white' : 'glass-subtle glass-subtle-themed text-section'
        }`}
      >
        <ThermometerIcon className="h-[1.15rem] w-[1.15rem]" />
      </button>
      {sheetOpen && <SickDaySheet dateKey={dateKey} onClose={() => setSheetOpen(false)} />}
    </>
  )
}

/** Exported — also the icon for the Statistik page's Krankheits-Diagramm (same "krank" concept, one glyph for it). */
export function ThermometerIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.5V5a2 2 0 1 0-4 0v9.5a4 4 0 1 0 4 0Z" />
      <path strokeLinecap="round" d="M10 8h2" />
    </svg>
  )
}
