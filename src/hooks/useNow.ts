import { useEffect, useState } from 'react'

/**
 * The current time, refreshed on an interval — used wherever the UI itself
 * should visibly react as time passes while the page stays open (the
 * supplement checklist's "current time slot" highlight), not just on the
 * next load/re-render triggered by something else.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
