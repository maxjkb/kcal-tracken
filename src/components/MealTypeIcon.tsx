import type { MealType } from '../lib/db'

/**
 * A small pictogram per meal type — sunrise/sun/moon/star, evoking the time
 * of day each category represents. Purely a shape distinction: every icon
 * renders in the single accent color (via `currentColor`, tinted by
 * whichever badge wraps it), never a different hue per type. Assigning each
 * meal type its own color would collide with what color already means in
 * this app — the exact same four hues already mark kcal/protein/carbs/fat
 * on every meal card, so reusing them here for a different kind of category
 * would read as a mismatched, confusing second meaning for the same colors.
 */
export function MealTypeIcon({ type, className = 'h-4 w-4' }: { type: MealType; className?: string }) {
  if (type === 'breakfast') return <SunriseIcon className={className} />
  if (type === 'lunch') return <SunIcon className={className} />
  if (type === 'dinner') return <MoonIcon className={className} />
  return <StarIcon className={className} />
}

function SunriseIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" d="M12 3v4" />
      <path strokeLinecap="round" d="M5.6 8.6 8 11" />
      <path strokeLinecap="round" d="M18.4 8.6 16 11" />
      <path strokeLinecap="round" d="M3 15h18" />
      <path strokeLinecap="round" d="M5 19h14" />
      <path strokeLinecap="round" d="M8 15a4 4 0 0 1 8 0" />
    </svg>
  )
}

function SunIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="4.5" />
      <path strokeLinecap="round" d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" />
    </svg>
  )
}

function MoonIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  )
}

function StarIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 3 2.4 5.4L20 9.3l-4.2 3.9 1.1 5.8L12 16.2l-4.9 2.8 1.1-5.8L4 9.3l5.6-.9Z"
      />
    </svg>
  )
}
