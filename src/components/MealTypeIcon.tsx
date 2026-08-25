import type { MealType } from '../lib/db'

/**
 * A small pictogram per meal type — sunrise, sun, moon, apple — evoking the
 * time of day each category represents. Colour comes from `currentColor` by
 * default, so a caller that wants the meal-type hue sets it via
 * MEAL_TYPE_COLOR rather than the icon deciding for itself.
 */
export function MealTypeIcon({ type, className = 'h-4 w-4' }: { type: MealType; className?: string }) {
  if (type === 'breakfast') return <SunriseIcon className={className} />
  if (type === 'lunch') return <SunIcon className={className} />
  if (type === 'dinner') return <MoonIcon className={className} />
  return <AppleIcon className={className} />
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

/**
 * Replaces the star, which said "favourite" far more than "snack" — a shape
 * already spoken for elsewhere in most interfaces. An apple is unambiguously
 * food and unambiguously the small, between-meals kind.
 */
function AppleIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8.5c1.4-1.3 3.4-1.6 5-.6 2 1.3 2.6 4.3 1.4 7-1 2.2-2.6 4.1-4 4.1-.9 0-1.5-.4-2.4-.4s-1.5.4-2.4.4c-1.4 0-3-1.9-4-4.1-1.2-2.7-.6-5.7 1.4-7 1.6-1 3.6-.7 5 .6Z"
      />
      <path strokeLinecap="round" d="M12 8.5V6m0 0c0-1.4 1.1-2.5 2.5-2.5" />
    </svg>
  )
}
