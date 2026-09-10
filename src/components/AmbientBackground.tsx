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
 *
 * Round 4 (v2.4): two more pieces of feedback on this pattern —
 *
 * 1. The accent (macro-color) cells were still solid-filled while the ink
 *    cells had gone outline-only, which read as inconsistent (and heavier
 *    than everything around it). They're outlined now too, same
 *    fill:none/stroke treatment as .amb-ink, just with the accent color as
 *    the stroke instead of var(--color-ink).
 * 2. A `<pattern>`'s repeat unit tiles identically forever, so whatever
 *    arrangement the 4 accent cells had within one tile was necessarily
 *    exactly repeated at every tile boundary — on a phone-sized viewport
 *    that's roughly 7×15 repeats of the old 55px tile, which reads as an
 *    obviously regular grid of color no matter how the 4 positions were
 *    chosen within it. Grown from a 5×5 (25-cell) tile to 8×8 (64 cells):
 *    the repeat period is large enough on a phone screen that the eye
 *    stops registering it as a grid, and the 4 accent positions below are
 *    hand-picked so no two share a row, a column, or a diagonal — nothing
 *    to visually connect them into a shape, which is what "gesprenkelt"
 *    (sprinkled) actually needs, more than the positions themselves.
 */
const GRID = 8
const CELL = 11
const TILE_SIZE = CELL * GRID
const BASE_FONT = CELL * 0.62

/**
 * Index → macro color var, in an 8×8 (0–63) grid. row = ⌊i/8⌋, col = i%8.
 * Chosen so rows {0,3,5,6}, columns {2,6,0,4}, and both diagonal sums
 * (row+col: 2,9,5,10) and differences (row−col: −2,−3,5,2) are all
 * pairwise distinct — no shared axis for the eye to pick out.
 */
const ACCENT_CELLS: Record<number, string> = {
  2: 'var(--color-kcal)', // row 0, col 2
  30: 'var(--color-protein)', // row 3, col 6
  40: 'var(--color-carbs)', // row 5, col 0
  52: 'var(--color-fat)', // row 6, col 4
}

/**
 * Per-cell size multiplier — a deterministic wobble around 1.0, same intent
 * as the original hand-typed 25-value array (reproducible, no per-build
 * randomness, no directional trend), just generated instead of hand-copied
 * now that the grid holds 64 cells rather than 25. The golden-angle step
 * (~137.5°) is the standard trick for a sequence that never lines up into
 * a visible repeat over a small span, which a plain low-frequency sine
 * would.
 */
const FONT_SCALE = Array.from({ length: GRID * GRID }, (_, i) => 1 + 0.13 * Math.sin(i * 2.399963))

const TILE_LETTERS = Array.from({ length: GRID * GRID }, (_, i) => {
  const row = Math.floor(i / GRID)
  const col = i % GRID
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
                  style={accent ? { fill: 'none', stroke: accent, strokeWidth: fontSize * 0.1 } : { strokeWidth: fontSize * 0.1 }}
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
