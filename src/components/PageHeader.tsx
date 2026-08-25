import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useAddMeal } from '../hooks/useAddMeal'

/** Scroll distance over which the edge effect fades in — short enough to feel immediate, long enough not to flicker. */
const EDGE_FADE_PX = 28

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
 *
 * ## Sticky, with a scroll edge effect
 *
 * The row stays put and the page's content passes *underneath* it. Per the
 * HIG's layout guidance, controls sit on top of content rather than on the
 * same plane — and the transition between the two is a scroll edge effect,
 * explicitly "instead of a background":
 *
 * > **Design Guideline — Layout**: "Differentiate controls from content.
 * > Instead of a background, use a scroll edge effect to provide a transition
 * > between content and the control area."
 *
 * So the material is not painted at rest: at the top of the page the header
 * floats over the page's own gradient with nothing between them, and the blur
 * plus a soft shadow fade in over the first 28px of scroll — the moment there
 * is actually content beneath to separate from. A permanently drawn bar would
 * be exactly the background the guideline rules out.
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
  const prefersReducedMotion = useReducedMotion()
  const { scrollY } = useScroll()

  // Driven straight from scroll position rather than from a boolean state:
  // a threshold that flips at one pixel makes the material pop in, and it
  // re-renders the whole header on every scroll tick. A MotionValue feeds the
  // compositor without a single React render.
  const edge = useTransform(scrollY, [0, EDGE_FADE_PX], [0, 1], { clamp: true })
  const edgeOpacity = prefersReducedMotion ? 1 : edge

  return (
    <div className={`sticky top-0 z-30 -mx-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-3 ${className}`}>
      {/* The edge effect itself. Separate, absolutely positioned layer so its
          opacity can be animated without touching the title's own rendering,
          and so the blur never applies to the text sitting on top of it.
          Nearly opaque rather than lightly tinted — a large surface has to
          carry its own legibility, and at 70% the numbers scrolling behind the
          title were still legible through it:
          > **Design Guideline — Liquid Glass**: "Larger elements appear more
          > opaque to preserve legibility over complex backgrounds."
          The mask fades the last fifth so the boundary is a gradient rather
          than a drawn line, which is the edge effect the layout guidance asks
          for in place of a divider. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-bg/92 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
        style={{ opacity: edgeOpacity }}
      />
      <div className="relative flex items-center justify-between gap-3">
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
