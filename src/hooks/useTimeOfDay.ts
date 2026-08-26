import { useEffect, useState } from 'react'
import { timeOfDayFor, type TimeOfDay } from '../lib/timeOfDay'

/** Cheap enough to run on a timer, and four transitions a day means a coarse one is plenty. */
const POLL_MS = 60_000

/**
 * The current time-of-day bucket, kept current while the app stays open.
 *
 * Two triggers rather than one: a slow poll covers a session left open
 * across a boundary (17:00 arriving while you're reading), and
 * `visibilitychange` covers the case that actually matters for an installed
 * PWA — it isn't closed between uses, it's backgrounded, so returning to it
 * hours later would otherwise still be showing the morning's tint until the
 * next poll tick.
 */
export function useTimeOfDay(): TimeOfDay {
  const [timeOfDay, setTimeOfDay] = useState(() => timeOfDayFor())

  useEffect(() => {
    // Compared against the previous value before setting, so a tick that
    // changes nothing (the overwhelming majority) doesn't re-render.
    const sync = () => setTimeOfDay((current) => {
      const next = timeOfDayFor()
      return next === current ? current : next
    })

    const timer = setInterval(sync, POLL_MS)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return timeOfDay
}
