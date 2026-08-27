import { ConcentricRings } from './NutrientRings'

/**
 * Fixed, illustrative fill levels — this is background chrome, not a data
 * view, so it deliberately does NOT read the day's real totals (that's
 * NutrientRings' job, front and center on Feed). Chosen just short of full
 * on each ring so the sweep gradient/tip highlight described in
 * NutrientRings.tsx actually shows, matching the look of the app icon
 * itself (public/favicon.svg, public/icon-512.png) rather than a flat,
 * fully-closed ring.
 */
const ILLUSTRATIVE_VALUES = { kcal: 1750, protein: 108, carbs: 220, fat: 60 }
const ILLUSTRATIVE_TARGETS = { kcal: 2000, protein: 130, carbs: 260, fat: 70 }

/**
 * The app icon's concentric nutrient rings, echoed faintly in the
 * bottom-right corner of the background on every screen (explicit request:
 * "unten rechts in der Ecke die Nährwertringe... wie auf dem App Icon").
 * Reuses ConcentricRings as-is rather than redrawing the rings — the CSS
 * class below blows it up and blurs/dims/drifts it into background texture
 * (see index.css's .background-rings), it doesn't need its own drawing
 * logic.
 *
 * Rendered unconditionally in App.tsx (not gated by section, unlike
 * TopGradient) — this is a property of the app's background as a whole,
 * not a per-area theme. Fixed + negative z-index, same stacking approach as
 * TopGradient: an ordinary, non-positioned sibling (the app's own content)
 * still paints over it regardless of z-index, so it never needs to know
 * what's on screen above it.
 *
 * Dark mode note (Hintergrund request 1C — only the white canvas should
 * turn black, nothing else): this component itself has no dark-mode
 * branch at all. --color-kcal/-protein/-carbs/-fat already carry their own
 * light/dark values (index.css), so the rings keep their own designed
 * colors automatically; only the flat --color-bg canvas behind them (body,
 * index.css) is what actually flips from near-white to black.
 */
export function BackgroundRings() {
  return (
    <div aria-hidden="true" className="background-rings pointer-events-none fixed bottom-0 right-0 -z-20">
      <ConcentricRings {...ILLUSTRATIVE_VALUES} targets={ILLUSTRATIVE_TARGETS} />
    </div>
  )
}
