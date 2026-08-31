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
 */
export function GlassSurface({
  as: Tag = 'div',
  rim = 22,
  className = '',
  children,
  ...rest
}: {
  as?: ElementType
  rim?: number
  className?: string
  children?: ReactNode
  [key: string]: unknown
}) {
  const ref = useGlassSurface<HTMLDivElement>(rim)
  return (
    <Tag ref={ref} className={`gl-surface ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
