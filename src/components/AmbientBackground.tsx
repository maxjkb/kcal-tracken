/**
 * Full-viewport backdrop behind every screen, mounted once so Liquid Glass
 * surfaces always have something to blur/refract regardless of scroll
 * position. All actual drawing lives in index.css's .ambient-bg (the plain
 * canvas colour) plus the <svg><pattern> below — this component just mounts
 * the pattern definition once and lets the CSS class size/position it.
 *
 * Global brainstorm round (v2.1): replaces the plain dot grid with a tiled
 * lowercase "t" in the app's own display face — explicit ask for something
 * more distinctive than an anonymous dot, tied to the app's own name-mark.
 *
 * Round 2 (v2.2): the first cut of this pattern (4×4, ~26px cells) drew
 * every "t" left-anchored plus a brick-offset stagger, which pushed the
 * rightmost column's glyphs past their own cell and into the neighbour's —
 * and an SVG <pattern> clips hard at its own tile edge with no overflow, so
 * those letters visibly lost their right side. Explicit feedback named that
 * bug directly ("die Buchstaben sind immer noch angeschnitten") plus three
 * more: too pale ("Schleier"-Look), too large/coarse, and the 4 macro-color
 * cells reading as washed-out rather than "kraftvoll". This version:
 *
 * - Every glyph is center-anchored (text-anchor/dominant-baseline: middle/
 *   central) within its own cell, so nothing can reach a tile edge at all —
 *   not tuned by eye, verified once via getBBox() against the true distance
 *   to the tile boundary before these numbers were hand-copied in here.
 * - A 5×5 meta-tile of small (CELL=11) cells reads as texture rather than
 *   legible letters — explicitly asked for over the coarser first attempt.
 * - FONT_SCALE varies each cell's size a little (0.85×–1.12×) instead of
 *   uniformly, per feedback on the winning direction wanting "a bit of size
 *   variation" rather than perfect uniformity or a directional gradient.
 * - Accent (macro-color) cells are always full-opacity/full-strength — no
 *   more dimming a color down to "a hint of it".
 *
 * Round 3 (v2.3): the plain-ink cells started out solid-filled in light mode
 * (only dark mode was outlined) — feedback wanted light mode outlined too,
 * for the same reason dark mode already was: a solid fill at this density
 * reads as noisier/heavier than an outline carrying the same texture. Both
 * themes now just stroke var(--color-ink) with no fill — one static CSS
 * rule (.amb-ink in index.css) instead of a per-theme fill/stroke split.
 */
const CELL = 11
const TILE_SIZE = CELL * 5
const BASE_FONT = CELL * 0.62

/** Index → macro color var. Spread across the 5×5 grid, not clustered. */
const ACCENT_CELLS: Record<number, string> = {
  6: 'var(--color-kcal)',
  13: 'var(--color-protein)',
  18: 'var(--color-carbs)',
  22: 'var(--color-fat)',
}

/**
 * Per-cell size multiplier — hand-authored, not randomized, so the tile
 * stays exactly reproducible: a deterministic wobble around 1.0 (0.85–1.12)
 * that reads as "a bit of variation" without a visible repeat or a
 * directional trend.
 */
const FONT_SCALE = [
  1.0, 0.85, 1.1, 0.95, 1.05, 0.9, 1.12, 1.0, 0.85, 1.05, 1.0, 0.95, 1.1, 0.9,
  1.0, 1.05, 0.85, 1.12, 0.95, 1.0, 0.9, 1.1, 1.0, 0.85, 1.05,
]

const TILE_LETTERS = Array.from({ length: 25 }, (_, i) => {
  const row = Math.floor(i / 5)
  const col = i % 5
  return {
    x: col * CELL + CELL / 2,
    y: row * CELL + CELL / 2,
    fontSize: BASE_FONT * FONT_SCALE[i],
  }
})

export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="ambient-bg fixed inset-0 -z-30">
      <svg>
        <defs>
          <pattern id="ambient-t-pattern" width={TILE_SIZE} height={TILE_SIZE} patternUnits="userSpaceOnUse">
            {TILE_LETTERS.map(({ x, y, fontSize }, i) => {
              const accent = ACCENT_CELLS[i]
              return (
                <text
                  key={i}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="Unbounded, sans-serif"
                  fontWeight={800}
                  fontSize={fontSize}
                  className={accent ? undefined : 'amb-ink'}
                  style={accent ? { fill: accent } : { strokeWidth: fontSize * 0.1 }}
                >
                  t
                </text>
              )
            })}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ambient-t-pattern)" />
      </svg>
    </div>
  )
}
