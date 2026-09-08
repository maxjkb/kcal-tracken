import { useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { useGlassSurface } from './glassSurfaces'
import { buildRefractionMaps, type RefractionMaps } from './refractionMaps'
import { GLASS_PRESETS } from './glassPhysics'

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
 * `refract`: opt-in, default off. Round 3 (v2.3): plain CSS glass
 * (`.glass`/`.glass-subtle` — backdrop-filter blur + a painted highlight)
 * has no real optical bending, which read as "Milchglas" against the busier
 * "t"-pattern background — explicit ask for the actual lens/refraction
 * look /lab's GlassSVG.tsx prototype has, without WebGL's problem (a
 * fragment shader can only bend a scene it paints itself, and that
 * synthetic scene had gone stale — see App.tsx's own comment on why
 * GlassStage stays off). SVG filters sidestep that entirely: the "copy of
 * what's behind" this bends is a real, live CSS background
 * (`--ambient-pattern`, index.css — its own comment there has the details)
 * rather than a rendered approximation, so it can never fall out of sync
 * with the actual page.
 *
 * It only works correctly for a surface that sits directly on the plain
 * ambient background with nothing else behind it — not one overlapping
 * scrolled cards/photos/other content, which this has no way to "see" (the
 * same fundamental limit backdrop-filter-based CSS glass has too, just
 * less obviously since a blur still vaguely tracks whatever's really
 * there). That's why this is opt-in rather than the new default: it's
 * applied to the handful of prominent, plain-background tiles per page
 * (hero cards, section headers, category tiles), not blanket-replacing
 * every `.glass`/`.glass-subtle` usage — list rows and content cards that
 * can sit over other content keep plain CSS glass.
 *
 * The light is a fixed point, not live pointer-tracked like /lab's own
 * pages: wiring per-frame pointer position into what could be dozens of
 * simultaneous card instances (rather than /lab's one prototype at a time)
 * costs real main-thread work for a highlight most users will never
 * consciously register moving. A static light (the same default angle
 * useLightSource() itself starts at) still gives the specular highlight and
 * rim brightening that read as "glass", just without the live follow.
 */
export function GlassSurface({
  as: Tag = 'div',
  rim = 22,
  webgl = false,
  refract = false,
  className = '',
  children,
  ...rest
}: {
  as?: ElementType
  rim?: number
  webgl?: boolean
  refract?: boolean
  className?: string
  children?: ReactNode
  [key: string]: unknown
}) {
  // Always called (rules of hooks) — only attached to the rendered element
  // when `webgl` is set, so a surface that opts out never actually
  // registers (its ref stays null, and useGlassSurface's effect no-ops on
  // a null ref) rather than registering-but-being-ignored.
  const glRef = useGlassSurface<HTMLDivElement>(rim)
  const refractRef = useRef<HTMLDivElement>(null)
  const [filterId] = useState(() => `gl-refract-${Math.random().toString(36).slice(2)}`)
  const [maps, setMaps] = useState<RefractionMaps | null>(null)

  useLayoutEffect(() => {
    if (!refract) return
    const el = refractRef.current
    if (!el) return
    // "Transparenz reduzieren" ⇒ no lens effect, same call GlassStage's own
    // WebGL path makes — the surface just falls back to plain CSS glass
    // (maps stays null, see the render branch below).
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return

    function measure() {
      const rect = el!.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const cornerRadius = parseFloat(getComputedStyle(el!).borderTopLeftRadius) || 0
      setMaps(buildRefractionMaps({ w: rect.width, h: rect.height, cornerRadius, rimWidth: rim }, GLASS_PRESETS.appGlas))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [refract, rim])

  if (!refract || !maps) {
    return (
      <Tag ref={webgl ? glRef : refract ? refractRef : undefined} className={`${webgl ? 'gl-surface' : ''} ${className}`} {...rest}>
        {children}
      </Tag>
    )
  }

  const params = GLASS_PRESETS.appGlas
  // Same default resting direction useLightSource() itself starts at
  // (azimuth 2.36, elevation 0.95) — a fixed point rather than live
  // pointer-tracked, see this component's own doc comment on why.
  const lightX = Math.cos(params.lightAzimuth) * Math.cos(params.lightElevation)
  const lightY = Math.sin(params.lightAzimuth) * Math.cos(params.lightElevation)
  const lightZ = Math.sin(params.lightElevation)
  const cx = maps.width / 2
  const cy = maps.height2 / 2
  const reach = Math.max(maps.width, maps.height2) * 0.9

  // `<p>`/`<span>` are phrasing content only — they can't validly contain
  // the block-level background/SVG layers below (a browser actually
  // auto-closes a `<p>` at the first nested `<div>`, silently splitting the
  // tile in two; React's DOM-nesting validator flags exactly this). The
  // outer positioned container that holds those layers is a `<div>` in that
  // case instead, with `Tag` kept only around the real content — which is
  // where an `as="p"`/`as="span"` caller's semantics actually live anyway.
  const isPhrasing = Tag === 'p' || Tag === 'span'
  const Outer = isPhrasing ? 'div' : Tag
  const outerProps = isPhrasing ? {} : rest
  const innerProps = isPhrasing ? rest : {}

  return (
    <Outer
      ref={refractRef}
      className={`gl-refract-active ${className}`}
      style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate' }}
      {...outerProps}
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          {/* Same filter chain as /lab's GlassSVG.tsx (see its own doc
              comment for why each step exists) — a static fePointLight
              instead of one written from a live ref every frame. */}
          <filter
            id={filterId}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={maps.width}
            height={maps.height2}
            colorInterpolationFilters="sRGB"
          >
            <feImage href={maps.displacement} x="0" y="0" width={maps.width} height={maps.height2} preserveAspectRatio="none" result="DISP" />
            <feDisplacementMap in="SourceGraphic" in2="DISP" scale={2 * maps.maxOffset} xChannelSelector="R" yChannelSelector="G" result="REFRACTED" />
            <feImage href={maps.height} x="0" y="0" width={maps.width} height={maps.height2} preserveAspectRatio="none" result="HEIGHT" />
            <feGaussianBlur in="HEIGHT" stdDeviation="2.2" result="HEIGHT_S" />
            <feSpecularLighting
              in="HEIGHT_S"
              surfaceScale={params.bulge * rim * 0.55}
              specularConstant={params.specular}
              specularExponent={Math.max(1, 60 * (1 - params.roughness))}
              lightingColor="#ffffff"
              result="SPEC"
            >
              <fePointLight x={cx + lightX * reach} y={cy - lightY * reach} z={Math.max(reach * 0.45, lightZ * reach * 0.75)} />
            </feSpecularLighting>
            <feComposite in="SPEC" in2="HEIGHT" operator="in" result="SPEC_MASKED" />
            <feComposite in="REFRACTED" in2="SPEC_MASKED" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
          </filter>
        </defs>
      </svg>

      {/* The "Hintergrundkopie" — a live CSS background (--ambient-pattern,
          background-attachment: fixed so it self-aligns to the viewport
          exactly like the real .ambient-bg behind it, no position math
          needed) filtered through the chain above. */}
      <div
        aria-hidden="true"
        className="gl-refract-bg"
        style={{ position: 'absolute', left: -maps.pad, top: -maps.pad, width: maps.width, height: maps.height2, filter: `url(#${filterId})` }}
      />

      {/* Eigenfarbe/Fresnel-Saum: reine Einfärbung, kein Filter nötig. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(closest-side, rgba(255,255,255,0) 62%, rgba(255,255,255,${(0.5 * params.fresnel).toFixed(2)}) 94%, rgba(255,255,255,${(0.16 * params.fresnel).toFixed(2)}) 100%)`,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,${(0.45 * params.fresnel).toFixed(2)})`,
        }}
      />

      {/* Positioned explicitly, not left to source order: an absolutely
          positioned sibling paints after (on top of) plain in-flow content
          regardless of DOM order, so the two layers above would otherwise
          sit over this text instead of under it. For the phrasing-content
          case `Tag` itself (the real `<p>`/`<span>`) is this wrapper, rather
          than an extra plain `<div>`, so `as="p"` callers still actually get
          a `<p>` somewhere in the output. */}
      {isPhrasing ? (
        <Tag className="relative" {...innerProps}>
          {children}
        </Tag>
      ) : (
        <div className="relative">{children}</div>
      )}
    </Outer>
  )
}
