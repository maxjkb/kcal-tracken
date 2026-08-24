import { useEffect, useState, type ReactNode } from 'react'

/**
 * Slides its content in from the right on mount. Used only by the Rezepte
 * pages — reached via their own dedicated bottom-nav icon and, per the
 * request, meant to visibly "slide over" the current screen instead of
 * just appearing like every other route swap in the app.
 */
export function SlideInPage({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      className="transition-transform duration-300 ease-out"
      style={{ transform: entered ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {children}
    </div>
  )
}
