/**
 * Full-viewport backdrop behind every screen, mounted once so Liquid Glass
 * surfaces always have something to blur/refract regardless of scroll
 * position. `position: fixed; inset: 0` (index.css's .ambient-bg) means it
 * never moves under scroll — it only ever needs to cover one viewport's
 * worth of space, not the scrollable page.
 *
 * Round 4 (v2.4) replaces the tiled "t" letter-grid this went through
 * several tunings of (plain dot grid → tiled letters → outlined/scattered
 * letters — see git history for those) with something structurally
 * different, not just another tuning pass: every one of those was, at
 * bottom, a *repeating texture*, and explicit feedback across every round
 * converged on the same complaint no amount of tuning fixed — too busy,
 * too "amateurhaft" — because a repeating pattern always gives the eye
 * something to lock onto and start reading as a grid. This version has no
 * repeat unit at all:
 *
 * - One single, enormous, barely-there "t" watermark, cropped into a
 *   corner — still the app's own name-mark, but there's exactly one of it
 *   on screen, so there's nothing to tile and nothing to read as a pattern.
 * - A sparse scatter of small dots in the four macro colors — a whisper of
 *   the app's color identity, hand-placed (not generated/tiled) at
 *   positions with no shared row/column/diagonal, so nothing lines up.
 *
 * Both colors derive from the same --color-ink/-kcal/-protein/-carbs/-fat
 * tokens as everywhere else, so light/dark just falls out of the existing
 * theme variables — unlike the old tiled pattern, this needs no baked
 * per-theme asset of its own.
 */
const CONFETTI: { x: number; y: number; size: number; color: string; opacity: number }[] = [
  { x: 10, y: 6, size: 6, color: 'var(--color-kcal)', opacity: 0.16 },
  { x: 68, y: 4, size: 4, color: 'var(--color-fat)', opacity: 0.14 },
  { x: 40, y: 11, size: 5, color: 'var(--color-protein)', opacity: 0.13 },
  { x: 88, y: 16, size: 4, color: 'var(--color-carbs)', opacity: 0.15 },
  { x: 20, y: 22, size: 4, color: 'var(--color-fat)', opacity: 0.12 },
  { x: 55, y: 27, size: 6, color: 'var(--color-kcal)', opacity: 0.14 },
  { x: 8, y: 35, size: 4, color: 'var(--color-carbs)', opacity: 0.13 },
  { x: 78, y: 38, size: 5, color: 'var(--color-protein)', opacity: 0.15 },
  { x: 32, y: 44, size: 4, color: 'var(--color-kcal)', opacity: 0.12 },
  { x: 92, y: 50, size: 5, color: 'var(--color-fat)', opacity: 0.14 },
  { x: 15, y: 56, size: 5, color: 'var(--color-protein)', opacity: 0.13 },
  { x: 62, y: 61, size: 4, color: 'var(--color-carbs)', opacity: 0.15 },
  { x: 44, y: 68, size: 6, color: 'var(--color-fat)', opacity: 0.12 },
  { x: 85, y: 74, size: 4, color: 'var(--color-kcal)', opacity: 0.14 },
  { x: 24, y: 80, size: 4, color: 'var(--color-carbs)', opacity: 0.13 },
  { x: 70, y: 88, size: 5, color: 'var(--color-protein)', opacity: 0.15 },
]

export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="ambient-bg fixed inset-0 -z-30">
      <span className="amb-watermark">t</span>
      {CONFETTI.map((dot, i) => (
        <span
          key={i}
          className="amb-fleck"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
            background: dot.color,
            opacity: dot.opacity,
          }}
        />
      ))}
    </div>
  )
}
