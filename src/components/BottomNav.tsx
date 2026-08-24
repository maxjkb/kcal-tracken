import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/recipes', label: 'Rezepte', icon: RecipesIcon, end: false },
  { to: '/', label: 'Feed', icon: FeedIcon, end: true },
  { to: '/stats', label: 'Statistik', icon: StatsIcon, end: false },
  { to: '/settings', label: 'Einstellungen', icon: SettingsIcon, end: false },
]

export function BottomNav({ onAddMeal }: { onAddMeal: () => void }) {
  return (
    // pointer-events-none on the full-width wrapper + pointer-events-auto on the
    // visible pill: otherwise the transparent strip around the pill still
    // intercepts taps on whatever page content happens to sit behind it.
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
      <div className="glass pointer-events-auto mx-4 flex gap-1 rounded-full p-1.5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              `flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                isActive ? 'glass-accent' : 'text-ink-soft'
              }`
            }
          >
            <Icon />
          </NavLink>
        ))}
        {/* Adds a meal for "Heute" — an action, not a route, so unlike the
            tabs above it never gets the active/selected highlight. */}
        <button
          type="button"
          onClick={onAddMeal}
          aria-label="Mahlzeit hinzufügen"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-ink"
        >
          <PlusIcon />
        </button>
      </div>
    </nav>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function RecipesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5c-1.5-1.3-3.6-2-6-2v13c2.4 0 4.5.7 6 2m0-13c1.5-1.3 3.6-2 6-2v13c-2.4 0-4.5.7-6 2m0-13v13" />
    </svg>
  )
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M12 20V4M20 20v-6" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  )
}
