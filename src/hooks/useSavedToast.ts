import { useState } from 'react'

/** A small "Gespeichert." confirmation toast, shared by every settings sub-page. */
export function useSavedToast() {
  const [message, setMessage] = useState<string | null>(null)

  function flash(text: string) {
    setMessage(text)
    setTimeout(() => setMessage(null), 2500)
  }

  return { message, flash }
}
