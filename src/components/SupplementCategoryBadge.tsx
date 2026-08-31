import { SUPPLEMENT_CATEGORY_COLORS, type SupplementCategory } from '../lib/db'

/**
 * A small colored, iconified badge for a supplement's category — the main
 * fix behind "mehr Farbe, weniger klinisch": every row/card used to be plain
 * black-on-white/glass with no color anywhere except the accent-blue
 * checkmark, the same "es fehlt an Farbe" complaint the Einstellungen redesign
 * answered for its own menu (see index.css's --color-supp-* block comment).
 *
 * Sized via `className` (the caller picks h-9 w-9 for a list row, h-7 w-7 for
 * a denser context, etc.) rather than a fixed size baked in here, matching
 * how SettingsSheet's own icon badges work.
 */
export function SupplementCategoryBadge({ category, className = 'h-9 w-9' }: { category: SupplementCategory; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl text-white ${className}`}
      style={{ background: SUPPLEMENT_CATEGORY_COLORS[category] }}
    >
      <CategoryIcon category={category} />
    </span>
  )
}

function CategoryIcon({ category }: { category: SupplementCategory }) {
  const className = 'h-[1.1rem] w-[1.1rem]'
  switch (category) {
    case 'build_muscle':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 10v4M2 9v6M20 9v6M22 10v4M6 12h12" />
        </svg>
      )
    case 'endurance':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" />
        </svg>
      )
    case 'recovery':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      )
    case 'joints':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M8 8l8 8" />
        </svg>
      )
    case 'immune':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
        </svg>
      )
    case 'cognition':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 'gut':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M5 19c0-8 4-13 14-14-1 10-6 14-14 14Z" />
          <path d="M8 16c2-3 5-6 9-9" />
        </svg>
      )
    case 'general_health':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
          <g transform="rotate(-30 12 12)">
            <rect x="3" y="8" width="18" height="8" rx="4" />
            <line x1="12" y1="8" x2="12" y2="16" />
          </g>
        </svg>
      )
  }
}
