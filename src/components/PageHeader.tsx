import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAddMeal } from '../hooks/useAddMeal'

/**
 * The shared top row of every main page: the page's own title on the left,
 * a cluster of round icon actions on the right.
 *
 * "Einstellungen" and "+" used to live in the bottom nav, which made the nav
 * pill crowded (six targets plus the "+" on a 375px screen) and put a
 * frequently-used action as far from the title as the layout allows. Both now
 * sit top-right on the title's own baseline, matching where iOS puts a
 * navigation bar's trailing items.
 *
 * `actions` lets a page prepend its own page-specific round button (Statistik's
 * PDF export) into the same cluster, so a page never grows a second, competing
 * row of controls.
 */
export function PageHeader({
  title,
  actions,
  showSettings = true,
  className = '',
}: {
  title: string
  /** Page-specific round buttons, rendered before the shared ones. Use HeaderButton for a matching shape. */
  actions?: ReactNode
  /** False on the Einstellungen page itself — a gear linking to the page you're already on is noise. */
  showSettings?: boolean
  className?: string
}) {
  const addMeal = useAddMeal()

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {showSettings && (
          <HeaderButton as={Link} to="/settings" label="Einstellungen">
            <SettingsIcon />
          </HeaderButton>
        )}
        <HeaderButton onClick={addMeal} label="Mahlzeit hinzufügen">
          <PlusIcon />
        </HeaderButton>
      </div>
    </div>
  )
}

/**
 * One round action in the header cluster. 40px — above the 44pt target once
 * the surrounding gap is counted, and small enough that three of them still
 * fit beside a title on the narrowest phone.
 */
export function HeaderButton({
  children,
  label,
  onClick,
  disabled,
  as,
  to,
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  as?: typeof Link
  to?: string
}) {
  const className =
    'glass-subtle glass-subtle-themed flex h-10 w-10 items-center justify-center rounded-full text-section shadow-sm shadow-black/5 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40'

  if (as && to) {
    return (
      <Link to={to} aria-label={label} title={label} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
    </button>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      className="h-5 w-5"
    >
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-[1.15rem] w-[1.15rem]"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  )
}
