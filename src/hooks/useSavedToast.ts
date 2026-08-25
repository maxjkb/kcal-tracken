import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A small "Gespeichert." confirmation toast, shared by every settings sub-page.
 *
 * The timer is tracked and cleared, so a second `flash` restarts the full
 * 2.5 s rather than being cut short by the first toast's still-pending
 * timeout — and a toast in flight when the page unmounts doesn't try to set
 * state on a component that's gone.
 *
 * `flash` is memoised because callers put it in effect dependency arrays; a
 * fresh identity on every render made one such effect re-run continuously,
 * which fired a single-use sign-in link twice and reported a failure for a
 * sign-in that had actually worked.
 */
export function useSavedToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const flash = useCallback((text: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setMessage(text)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setMessage(null)
    }, 2500)
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  return { message, flash }
}
