import { createContext } from 'react'
import type { MotionValue } from 'motion/react'

/**
 * Where the app currently sits between the four main areas, as a fractional
 * index into SECTION_TABS: 2 is Feed, 2.4 is 40% of the way from Feed toward
 * Statistik, 3 is Statistik.
 *
 * Exists so the page and the bottom nav's selection pill are driven by one
 * number instead of animating separately. Before this they were two
 * independent animations that merely started at the same moment — and any
 * difference in their timing (a lazily-loaded route arriving late, one spring
 * settling before the other) showed up as the pill and the page disagreeing
 * about which tab you were on, mid-gesture.
 *
 * A MotionValue rather than React state on purpose: it updates on every
 * pointer move without re-rendering the tree, and feeds transforms straight to
 * the compositor.
 */
export const SwipeProgressContext = createContext<MotionValue<number> | null>(null)
