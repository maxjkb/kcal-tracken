import type { Transition } from 'motion/react'

/**
 * Shared spring presets, per the Apple "Designing Fluid Interfaces" model:
 * `bounce` (0 = critically damped/no overshoot, higher = bouncier) plus
 * `duration` (how quickly it settles — not a fixed-duration animation, the
 * spring's actual settle time still emerges from the physics). Reach for
 * `SPRING_MOMENTUM` only when the motion follows an actual gesture (a flick,
 * a drag release) — overshoot on something that just appears reads as a bug,
 * not polish.
 */

/** Critically damped, no overshoot — the default for anything that isn't gesture-released (sheets materializing, layout shifts, toggles). */
export const SPRING_DEFAULT: Transition = { type: 'spring', bounce: 0, duration: 0.4 }

/** Snappier critically damped spring — small, immediate UI feedback (press states, active-tab indicator). */
export const SPRING_SNAPPY: Transition = { type: 'spring', bounce: 0, duration: 0.25 }

/** Slight bounce — reserved for momentum-driven interactions only (a flick, a drag release). */
export const SPRING_MOMENTUM: Transition = { type: 'spring', bounce: 0.22, duration: 0.4 }

/** Fast, no-bounce fade — backdrops/scrims (opacity only, never wants overshoot). */
export const SPRING_FADE: Transition = { type: 'spring', bounce: 0, duration: 0.25 }

/** `prefers-reduced-motion`: short opacity cross-fade, no spring/overshoot/parallax. */
export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0.15, ease: 'easeOut' }
