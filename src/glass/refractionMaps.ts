import {
  heightFromEdge, refractionOffset, sdRoundBox, surfaceNormalFromEdge, type GlassParams,
} from './glassPhysics'

/**
 * Production port of /lab's GlassSVG.tsx `buildMaps()` — same physics, same
 * per-pixel loop, generalized from the lab's fixed-size prototype shapes to
 * "whatever size a real card happens to render at" and cached, since a real
 * page has many distinct card sizes rather than one fixed stage.
 *
 * What this computes: two greyscale maps a card-sized area needs for its
 * SVG refraction filter (see GlassSurface.tsx's own comment on the filter
 * chain) — a displacement map (R/G channels encode x/y offset, 128 = none)
 * and a height map (alpha channel encodes surface height, for the specular
 * light). Both are shape-only: they depend on width/height/cornerRadius/
 * rimWidth and the material params, never on content or theme, so a card
 * re-rendering with new text doesn't cost a recompute — only an actual
 * resize does.
 */
export interface RefractionMaps {
  /** data: URL, PNG. */
  displacement: string
  /** data: URL, PNG. */
  height: string
  /** Max displacement in px — feDisplacementMap's `scale` is 2× this. */
  maxOffset: number
  /** Full canvas size the maps (and the filter region) cover, in px. */
  width: number
  height2: number
  /** Padding around the shape the maps extend into, in px. */
  pad: number
}

export interface RefractionShape {
  w: number
  h: number
  cornerRadius: number
  rimWidth: number
}

const cache = new Map<string, RefractionMaps>()

function cacheKey(shape: RefractionShape, params: GlassParams): string {
  // Rounded to the nearest px: a card that's 1px off from a previous layout
  // pass (a subpixel scroll/zoom rounding) doesn't deserve its own cache
  // entry — the visible difference is nil, the compute cost isn't.
  return [
    Math.round(shape.w), Math.round(shape.h), Math.round(shape.cornerRadius), Math.round(shape.rimWidth),
    params.bulge, params.profile, params.ior, params.roughness,
  ].join('|')
}

export function buildRefractionMaps(shape: RefractionShape, params: GlassParams): RefractionMaps {
  const key = cacheKey(shape, params)
  const cached = cache.get(key)
  if (cached) return cached

  const pad = Math.ceil(Math.max(24, params.depth * 1.2))
  const W = Math.ceil(shape.w) + pad * 2
  const H = Math.ceil(shape.h) + pad * 2
  const halfW = shape.w / 2
  const halfH = shape.h / 2

  const disp = document.createElement('canvas')
  disp.width = W
  disp.height = H
  const dctx = disp.getContext('2d')!
  const dimg = dctx.createImageData(W, H)

  const hgt = document.createElement('canvas')
  hgt.width = W
  hgt.height = H
  const hctx = hgt.getContext('2d')!
  const himg = hctx.createImageData(W, H)

  const maxH = Math.max(1e-3, params.bulge * shape.rimWidth)

  const offX = new Float32Array(W * H)
  const offY = new Float32Array(W * H)
  const heights = new Float32Array(W * H)
  let maxOffset = 1e-3

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x - pad - halfW + 0.5
      const py = y - pad - halfH + 0.5
      const d = sdRoundBox(px, py, halfW, halfH, shape.cornerRadius)
      const i = y * W + x
      if (d >= 0) continue
      const edge = -d
      const e = 0.75
      const gx = sdRoundBox(px + e, py, halfW, halfH, shape.cornerRadius) - sdRoundBox(px - e, py, halfW, halfH, shape.cornerRadius)
      const gy = sdRoundBox(px, py + e, halfW, halfH, shape.cornerRadius) - sdRoundBox(px, py - e, halfW, halfH, shape.cornerRadius)
      const gl = Math.hypot(gx, gy) || 1
      const N = surfaceNormalFromEdge(edge, shape.rimWidth, gx / gl, gy / gl, params)
      if (!N) continue
      const [ox, oy] = refractionOffset(N, params)
      offX[i] = ox
      offY[i] = oy
      heights[i] = heightFromEdge(edge, shape.rimWidth, params) / maxH
      const m = Math.max(Math.abs(ox), Math.abs(oy))
      if (m > maxOffset) maxOffset = m
    }
  }

  for (let i = 0; i < W * H; i++) {
    const p4 = i * 4
    const dith = () => Math.random() - 0.5
    dimg.data[p4] = Math.round(Math.max(0, Math.min(255, 128 + (offX[i] / maxOffset) * 127 + dith())))
    dimg.data[p4 + 1] = Math.round(Math.max(0, Math.min(255, 128 + (offY[i] / maxOffset) * 127 + dith())))
    dimg.data[p4 + 2] = 128
    dimg.data[p4 + 3] = 255
    himg.data[p4] = 255
    himg.data[p4 + 1] = 255
    himg.data[p4 + 2] = 255
    himg.data[p4 + 3] = Math.round(Math.max(0, Math.min(255, heights[i] * 255 + (Math.random() - 0.5))))
  }

  dctx.putImageData(dimg, 0, 0)
  hctx.putImageData(himg, 0, 0)

  const maps: RefractionMaps = {
    displacement: disp.toDataURL(),
    height: hgt.toDataURL(),
    maxOffset,
    width: W,
    height2: H,
    pad,
  }
  cache.set(key, maps)
  return maps
}
