/**
 * Decorative color-to-background wash across the top quarter of the screen —
 * gives the Liquid Glass elements (glass/glass-subtle bars and cards) near
 * the top of the main pages something colorful to blur/frost instead of a
 * flat background, making the glass effect itself read more clearly.
 *
 * Uses --color-section rather than a hardcoded blue, so each of the four
 * main areas (Feed/Rezepte/Supplements/Statistik) washes in its own color —
 * App.tsx sets that custom property on <body> based on the current route.
 * Falls back to --color-accent (plain blue) wherever nothing sets it, so
 * this component itself never needs to know which area it's in.
 *
 * A "hill" gradient — transparent, up to peak color, back to transparent —
 * rather than a plain top-to-bottom fade. Real iOS Safari measures `dvh`
 * against a viewport size that can shift by the address bar's/Dynamic
 * Island's exact chrome height, something this Chromium sandbox can't
 * faithfully reproduce; a plain fade starts at near-full color right at
 * y=0, so any such mismatch reads as a hard, misaligned edge right at the
 * very top on a real device. Starting and ending at transparent removes
 * that hard edge structurally — there's no sharp color boundary left for a
 * measurement mismatch to expose, regardless of the exact peak position.
 *
 * Fixed to the viewport (stays put while the page scrolls beneath it);
 * the page's own background shows through both above and below the color
 * band, resolving to near-white in light mode and black in dark mode
 * automatically, without a separate dark-mode override. Purely decorative:
 * pointer-events-none, and a negative z-index keeps it behind all normal
 * (non-positioned) page content without needing to touch every page's own
 * layout.
 *
 * Rendered on every route within each of the four main areas, not just
 * their roots (see App.tsx's isThemedSection) — put it directly in
 * App.tsx's Routes rather than each page component if that set ever grows.
 */
export function TopGradient() {
  return (
    <div
      aria-hidden="true"
      className="top-gradient pointer-events-none fixed inset-x-0 -z-10"
      style={{
        background:
          'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-section) 45%, transparent) 35%, transparent)',
      }}
    />
  )
}
