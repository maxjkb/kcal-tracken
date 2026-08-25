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
 * Fixed to the viewport (stays put while the page scrolls beneath it),
 * fades to transparent so the page's own background shows through — that
 * resolves to near-white in light mode and to black in dark mode
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
          'linear-gradient(to bottom, color-mix(in srgb, var(--color-section) 45%, transparent), transparent)',
      }}
    />
  )
}
