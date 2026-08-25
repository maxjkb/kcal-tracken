import { NavLink } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING_SNAPPY } from '../lib/motionTokens'
import { SECTION_TABS } from '../lib/sections'

/** Icons live here rather than in lib/sections.ts so that module stays free of JSX and rendering concerns. */
const TAB_ICONS: Record<string, () => React.JSX.Element> = {
  '/recipes': RecipesIcon,
  '/supplements': SupplementsIcon,
  '/': FeedIcon,
  '/stats': StatsIcon,
}

export function BottomNav() {
  const prefersReducedMotion = useReducedMotion()

  return (
    // pointer-events-none on the full-width wrapper + pointer-events-auto on the
    // visible pill: otherwise the transparent strip around the pill still
    // intercepts taps on whatever page content happens to sit behind it.
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
      {/* Back to a roomier mx-4/gap-1 now that it's four tabs rather than six
          plus a "+" — the pill no longer has to fight for width on a 375px
          iPhone SE, so the targets can breathe. */}
      <div className="glass pointer-events-auto mx-4 flex gap-1 rounded-full p-1.5">
        {SECTION_TABS.map(({ to, label, end }) => {
          const Icon = TAB_ICONS[to]
          return (
          <NavLink key={to} to={to} end={end} aria-label={label} className="relative flex h-11 w-11 items-center justify-center rounded-full">
            {({ isActive }) => (
              <>
                {/* A single shared-layoutId pill slides between tabs instead of
                    each tab getting its own independent background — the same
                    "magnetic" tab-bar motion iOS uses, so switching tabs reads
                    as one element moving, not one fading out while another
                    fades in. */}
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="glass-accent absolute inset-0 rounded-full"
                    transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
                  />
                )}
                <span className={`relative z-10 transition-colors ${isActive ? 'text-white' : 'text-ink-soft'}`}>
                  <Icon />
                </span>
              </>
            )}
          </NavLink>
          )
        })}
      </div>
    </nav>
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

function SupplementsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <rect x="4" y="9" width="16" height="6" rx="3" transform="rotate(45 12 12)" />
      <path strokeLinecap="round" d="M12 9v6" transform="rotate(45 12 12)" />
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

