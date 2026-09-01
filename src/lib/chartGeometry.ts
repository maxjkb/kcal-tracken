/**
 * The plotting maths the trend chart used to get from recharts.
 *
 * Split out from the component so it can be reasoned about — and tested —
 * as plain functions on numbers, with no DOM and no React in the way.
 */

export interface Point {
  x: number
  y: number
}

/**
 * A monotone cubic through the given points, as an SVG path.
 *
 * This is the Fritsch–Carlson construction (what d3-shape calls
 * `curveMonotoneX`, and what the chart asked recharts for as
 * `type="monotone"`). Its defining property is the reason it is the right
 * curve here and a plain Catmull–Rom is not: it never overshoots. A smooth
 * spline through two low days either side of one high one dips *below* both
 * low days on the way through, drawing a calorie count nobody ate — on a
 * chart whose whole job is "was this day high or low", an invented dip is a
 * lie. Monotone interpolation is flat where the data turns, so every point
 * on the curve stays inside the range of the points around it.
 *
 * Fewer than two points has no curve to draw and returns an empty path.
 */
export function monotonePath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`

  const n = points.length
  // Secant slope of each segment.
  const delta: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    delta.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx)
  }

  // Tangent at each point: the average of the two neighbouring secants, and
  // the secant itself at the two ends.
  const m: number[] = [delta[0]]
  for (let i = 1; i < n - 1; i++) m.push((delta[i - 1] + delta[i]) / 2)
  m.push(delta[n - 2])

  // The monotonicity fix-up. A flat segment pins both its tangents to zero;
  // otherwise the tangent pair is pulled back inside a circle of radius 3
  // (in units of the segment's own slope), which is the condition under
  // which the cubic cannot overshoot.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const alpha = m[i] / delta[i]
    const beta = m[i + 1] / delta[i]
    const s = alpha * alpha + beta * beta
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      m[i] = tau * alpha * delta[i]
      m[i + 1] = tau * beta * delta[i]
    }
  }

  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x
    const c1x = points[i].x + h / 3
    const c1y = points[i].y + (m[i] * h) / 3
    const c2x = points[i + 1].x - h / 3
    const c2y = points[i + 1].y - (m[i + 1] * h) / 3
    d += `C${c1x},${c1y} ${c2x},${c2y} ${points[i + 1].x},${points[i + 1].y}`
  }
  return d
}

/**
 * Round a range outward to values a person would have chosen, and return the
 * gridline positions inside it.
 *
 * Axis labels are read, not measured: 0 / 1.000 / 2.000 / 3.000 is a scale
 * you can hold in your head, 0 / 847 / 1.694 / 2.541 is not, even though
 * both describe the same data. So the step is snapped to 1, 2 or 5 times a
 * power of ten — the set of intervals that stay legible at any magnitude —
 * and the top of the axis is raised to the next whole step.
 *
 * `max` is exclusive of nothing: a value landing exactly on a step keeps that
 * step as the top of the chart rather than adding an empty one above it.
 */
export function niceTicks(max: number, count = 4): { ticks: number[]; top: number } {
  if (!Number.isFinite(max) || max <= 0) return { ticks: [0], top: 1 }
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v))
  return { ticks, top }
}

/**
 * Which x-axis labels to draw so they don't collide.
 *
 * recharts' `interval="preserveStartEnd"`, reimplemented: show every k-th
 * label for the smallest k that fits, and always keep the first and last —
 * the two that anchor the reader in time ("this week runs Monday to
 * Sunday"). Dropping either of those to save a few pixels costs more than
 * the crowding it prevents.
 *
 * The last label is kept even when the stride doesn't land on it, so the
 * gap before it can be shorter than the others. That is deliberate: an
 * uneven final gap reads as "the axis ends here", a missing final label
 * reads as an error.
 */
export function visibleLabelIndices(count: number, available: number, perLabel: number): number[] {
  if (count <= 1) return count === 1 ? [0] : []
  const fits = Math.max(2, Math.floor(available / perLabel))
  const stride = Math.max(1, Math.ceil((count - 1) / (fits - 1)))
  const out: number[] = []
  for (let i = 0; i < count; i += stride) out.push(i)
  if (out[out.length - 1] !== count - 1) out.push(count - 1)
  return out
}
