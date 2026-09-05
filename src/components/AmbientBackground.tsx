/**
 * Big-Number-Redesign, point 5: a full-viewport, always-present colour field
 * behind every screen — replaces TopGradient's top-quarter-only wash, whose
 * limited reach was a real part of why Liquid Glass surfaces further down a
 * page had nothing colourful left to blur/refract. All the actual drawing
 * lives in index.css's .ambient-bg (three large, heavily blurred circles —
 * abstract and minimal on purpose, not a busy graphic); this component is
 * just the mount point.
 *
 * Still area-aware exactly like TopGradient was: two of the three blurred
 * circles read --color-section, which App.tsx keeps set to whichever of the
 * four main areas (Feed/Rezepte/Supplements/Statistik) is current. The third
 * stays fixed on --color-kcal — Kalorien is the one constant hero figure
 * across every screen now, so its colour gets a constant presence in the
 * background too, not just inside the hero numbers themselves.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="ambient-bg fixed inset-0 -z-30">
      <span className="ambient-blob" />
    </div>
  )
}
