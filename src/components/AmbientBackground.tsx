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
 * One repeat unit (TILE_LETTERS below) holds 16 "t"s in a 4×4, brick-offset
 * grid so the texture doesn't read as a rigid checkerboard; most are ink at
 * a faint 6% opacity, four — one per macro — sit at a more noticeable 14%,
 * scattered rather than clustered so no single corner of the tile reads as
 * "the colourful bit". The whole unit then repeats via SVG's own <pattern>,
 * same mechanism the old dot grid used, just with a richer tile.
 */
const TILE_SIZE = 104
const CELL = TILE_SIZE / 4

/** i = row*4+col. Odd rows shift right by half a cell (brick offset) so the repeat doesn't read as a plain grid. */
const TILE_LETTERS = Array.from({ length: 16 }, (_, i) => {
  const row = Math.floor(i / 4)
  const col = i % 4
  const stagger = row % 2 === 1 ? CELL / 2 : 0
  return {
    x: col * CELL + stagger + CELL * 0.2,
    y: row * CELL + CELL * 0.78,
  }
})

/** Index → macro color var, for the four cells that break from plain ink. Spread across the tile rather than grouped. */
const ACCENT_CELLS: Record<number, string> = {
  2: 'var(--color-kcal)',
  7: 'var(--color-protein)',
  9: 'var(--color-carbs)',
  13: 'var(--color-fat)',
}

export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="ambient-bg fixed inset-0 -z-30">
      <svg>
        <defs>
          <pattern id="ambient-t-pattern" width={TILE_SIZE} height={TILE_SIZE} patternUnits="userSpaceOnUse">
            {TILE_LETTERS.map(({ x, y }, i) => {
              const accent = ACCENT_CELLS[i]
              return (
                <text
                  key={i}
                  x={x}
                  y={y}
                  fontFamily="Unbounded, sans-serif"
                  fontWeight={700}
                  fontSize={CELL * 0.92}
                  style={{ fill: accent ?? 'var(--color-ink)', opacity: accent ? 0.14 : 0.06 }}
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
