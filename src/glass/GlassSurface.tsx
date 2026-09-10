import type { ElementType, ReactNode } from 'react'
import { useGlassSurface } from './glassSurfaces'

/**
 * Wraps a single flow-positioned card/tile/segmented-control in the app's
 * real markup, registering it with the WebGL glass layer (GlassStage) while
 * leaving everything else about it untouched.
 *
 * Deliberately thin: it adds exactly `ref` (for position tracking) and the
 * `gl-surface` class (the hook GlassStage's injected stylesheet uses to
 * blank out the CSS material once WebGL is confirmed running) on top of
 * whatever className the caller already had — the existing `.glass`/
 * `.glass-subtle`/`.glass-subtle-themed` classes stay exactly as they were.
 * That's deliberate, not an oversight: those classes are what renders
 * whenever WebGL doesn't (no WebGL2, a lost context, "reduce
 * transparency") — see GlassStage.tsx's own comment on why CSS is the
 * default, not the fallback.
 *
 * Not used for anything animated by Motion (Sheets, AnimatePresence
 * popups, StaggeredList entrances) — those move via a transform GlassStage
 * has no way to hear about outside a wake() call, and wiring that in per
 * animation site was out of scope for this pass. Those keep plain CSS glass
 * only, which is correct for them either way, not a compromise.
 *
 * `rim`: how far the material's curvature reaches in from the edge, in px.
 * Small keeps the middle flat so text sitting on it stays undistorted —
 * see glassSurfaces.ts's own doc comment on why that matters more than it
 * sounds like it would.
 *
 * `webgl`: opt-in, default off. GlassStage was disabled outright (App.tsx,
 * `enabled={false}`) after real-world use showed the WebGL layer visibly
 * lagging/drifting during native scroll — it reads every surface's position
 * once per animation frame, but the browser's compositor thread can already
 * be a few pixels further into the scroll by the time that frame actually
 * paints, and a canvas overlay tracking DOM scroll from the main thread
 * can't fully close that gap. Round 2 (v2.2): re-enabled, but scoped to
 * exactly the surfaces that don't have this problem in the first place —
 * `position: fixed` chrome that never moves under a scroll (BottomNav) —
 * rather than every flow-positioned card again. Every existing call site
 * left this prop unset when GlassStage was re-enabled, which is deliberate:
 * they stay plain CSS glass (this component's behavior for them is
 * unchanged either way `enabled` is set), and only the few sites that
 * explicitly pass `webgl` register with the WebGL layer at all.
 *
 * Round 3 (v2.3) briefly added a `refract` mode here — a per-instance SVG
 * filter bending a live copy of the background pattern, ported from
 * /lab's GlassSVG.tsx. Round 4: explicit feedback that on a real device,
 * against the busier "t" pattern, it made cards nearly as hard to read as
 * no card at all (the filter's displacement is only visible in a thin rim
 * band — the flat middle, i.e. most of any card's area, passed the
 * unblurred pattern straight through once `.glass`/`.glass-subtle`'s own
 * background got turned off for it) — and building a fresh displacement/
 * height canvas per tile via ResizeObserver was real, likely-visible cost
 * on every affected page. Removed entirely rather than tuned: plain CSS
 * glass (blur + tint, see `.glass-subtle` in index.css) is the material
 * every surface in the app uses again, with that class itself made more
 * opaque to compensate for the busier background — see index.css's own
 * comment there. `refractionMaps.ts` and the `--ambient-pattern` CSS
 * background-copy plumbing were removed along with it; the underlying
 * Snell's-law math in glassPhysics.ts stays, since GlassStage's WebGL path
 * still uses it.
 */
export function GlassSurface({
  as: Tag = 'div',
  rim = 22,
  webgl = false,
  className = '',
  children,
  ...rest
}: {
  as?: ElementType
  rim?: number
  webgl?: boolean
  className?: string
  children?: ReactNode
  [key: string]: unknown
}) {
  // Always called (rules of hooks) — only attached to the rendered element
  // when `webgl` is set, so a surface that opts out never actually
  // registers (its ref stays null, and useGlassSurface's effect no-ops on
  // a null ref) rather than registering-but-being-ignored.
  const glRef = useGlassSurface<HTMLDivElement>(rim)

  return (
    <Tag ref={webgl ? glRef : undefined} className={`${webgl ? 'gl-surface' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
