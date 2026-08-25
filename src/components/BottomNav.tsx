import { NavLink, useLocation } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { SECTION_TABS, sectionIndexForPath } from '../lib/sections'
import { useSwipeProgress } from '../hooks/useSwipeProgress'

/** Tab hit area (h-11 = 44px) plus the gap-1 between them — the stride the selection pill travels per tab. */
const TAB_STRIDE_PX = 48

/** Icons live here rather than in lib/sections.ts so that module stays free of JSX and rendering concerns. */
const TAB_ICONS: Record<string, () => React.JSX.Element> = {
  '/recipes': RecipesIcon,
  '/supplements': SupplementsIcon,
  '/': FeedIcon,
  '/stats': StatsIcon,
}

export function BottomNav() {
  const prefersReducedMotion = useReducedMotion()
  const location = useLocation()
  const progress = useSwipeProgress()
  const activeIndex = sectionIndexForPath(location.pathname)

  return (
    // pointer-events-none on the full-width wrapper + pointer-events-auto on the
    // visible pill: otherwise the transparent strip around the pill still
    // intercepts taps on whatever page content happens to sit behind it.
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
      {/* Back to a roomier mx-4/gap-1 now that it's four tabs rather than six
          plus a "+" — the pill no longer has to fight for width on a 375px
          iPhone SE, so the targets can breathe. */}
      <div className="glass pointer-events-auto mx-4 flex gap-1 rounded-full p-1.5">
        <div className="relative flex gap-1">
          {activeIndex !== -1 && <SelectionPill progress={progress} activeIndex={activeIndex} />}
          {SECTION_TABS.map(({ to, label, end }, i) => {
            const Icon = TAB_ICONS[to]
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={label}
                className="relative flex h-11 w-11 items-center justify-center rounded-full"
              >
                <TabIcon Icon={Icon} index={i} progress={progress} activeIndex={activeIndex} prefersReducedMotion={prefersReducedMotion} />
              </NavLink>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

/**
 * The selected-tab pill, positioned from the shared swipe progress rather than
 * from a `layoutId` shared-layout animation.
 *
 * layoutId animated on its own clock: it started when the route changed, while
 * the page ran a separate animation of its own, so a swipe showed the pill and
 * the page disagreeing about which tab you were on for as long as the two
 * springs differed. Driving both from one fractional index means the pill is
 * simply *at* the position the gesture is at — during the drag, during the
 * settle, and on a plain tap alike.
 */
function SelectionPill({ progress, activeIndex }: { progress: ReturnType<typeof useSwipeProgress>; activeIndex: number }) {
  const fallback = useMotionValue(activeIndex)
  const source = progress ?? fallback
  const x = useTransform(source, (value) => clampIndex(value) * TAB_STRIDE_PX)

  return (
    <motion.div
      aria-hidden="true"
      className="glass-accent absolute left-0 top-0 h-11 w-11 rounded-full"
      style={{ x }}
    />
  )
}

/**
 * Icon colour follows the same fractional index: as the pill slides off one
 * tab and onto the next, the outgoing icon fades back to grey and the incoming
 * one to white in step with it — rather than both snapping at the moment the
 * route changes.
 */
function TabIcon({
  Icon,
  index,
  progress,
  activeIndex,
  prefersReducedMotion,
}: {
  Icon: () => React.JSX.Element
  index: number
  progress: ReturnType<typeof useSwipeProgress>
  activeIndex: number
  prefersReducedMotion: boolean | null
}) {
  const fallback = useMotionValue(activeIndex)
  const source = progress ?? fallback
  // 1 directly under the pill, 0 a full tab away — the pill's own coverage.
  const opacity = useTransform(source, (value) => Math.max(0, 1 - Math.abs(clampIndex(value) - index)))

  if (prefersReducedMotion) {
    return (
      <span className={`relative z-10 ${index === activeIndex ? 'text-white' : 'text-ink-soft'}`}>
        <Icon />
      </span>
    )
  }

  return (
    <span className="relative z-10 text-ink-soft">
      <Icon />
      <motion.span className="absolute inset-0 text-white" style={{ opacity }} aria-hidden="true">
        <Icon />
      </motion.span>
    </span>
  )
}

/** Keeps the pill inside the bar when a rubber-banded swipe pushes progress past either end. */
function clampIndex(value: number): number {
  return Math.max(0, Math.min(SECTION_TABS.length - 1, value))
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

