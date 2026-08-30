import { useEffect, useRef } from 'react'
import { GLASS_VERT } from '../glassShader'
import { APP_GLASS_FRAG } from './appGlassShader'
import { GLASS_PRESETS } from '../glassPhysics'
import { readSurfaces, setWakeHandler } from './glassSurfaces'
import type { LightState } from '../useLightSource'

/**
 * Die WebGL-Glasebene für die App.
 *
 * Ein einziges bildschirmfüllendes Canvas ganz hinten, das den Seitenhinter-
 * grund UND alle angemeldeten Glasflächen zeichnet. Der Text bleibt DOM und
 * liegt darüber.
 *
 * Drei Entscheidungen, die den Prototyp überhaupt erst tragfähig machen:
 *
 * 1. CSS-Glas ist der Standard, nicht der Notfall. Die Flächen behalten ihr
 *    heutiges Aussehen; erst wenn der Shader nachweislich läuft, setzt diese
 *    Komponente die Klasse `glass-gl-active` und schaltet das CSS-Glas ab.
 *    Damit ist jeder Ausfall automatisch abgefangen — fehlendes WebGL2,
 *    Kontextverlust, „Transparenz reduzieren" —, ohne dass irgendwo ein
 *    zweiter Codepfad gepflegt werden müsste.
 *
 * 2. Die Schleife hält an. Ein Ernährungstagebuch steht die meiste Zeit still.
 *    Nach kurzer Ruhe stoppt requestAnimationFrame ganz und läuft erst wieder
 *    an, wenn etwas passiert. Das war der eigentliche Akku-Einwand gegen
 *    WebGL, und er lässt sich ausräumen.
 *
 * 3. Kontextverlust wird behandelt. iOS verwirft WebGL-Kontexte, wenn der
 *    Speicher knapp wird oder die PWA im Hintergrund war.
 */

export interface GlassStats {
  fps: number
  /** Millisekunden pro Bild, 95. Perzentil über das letzte Fenster. */
  frameP95: number
  /** Anteile des Frames, in ms — die eigentliche Frage des Prototyps. */
  rectMs: number
  styleMs: number
  drawMs: number
  shapes: number
  idle: boolean
  /** Gezeichnete Bilder seit dem Start — waechst der Wert im Ruhezustand nicht, steht die Schleife wirklich. */
  frames: number
  /** Name der Grafikeinheit. Enthaelt er "SwiftShader" o.ae., rechnet der Browser in Software und alle Zeitwerte hier sind wertlos. */
  renderer: string
}

const MAX_SHAPES = 12
/** Wie lange nach dem letzten Ereignis weitergezeichnet wird, bevor die Schleife anhält. */
const IDLE_AFTER_MS = 700

/** #rgb, #rrggbb und rgb()/rgba() — mehr Formate kommen aus den Tokens nicht. */
function parseColor(v: string): [number, number, number] {
  const s = v.trim()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [
      parseInt(f.slice(0, 2), 16) / 255,
      parseInt(f.slice(2, 4), 16) / 255,
      parseInt(f.slice(4, 6), 16) / 255,
    ]
  }
  const m = s.match(/-?[\d.]+/g)
  if (m && m.length >= 3) return [+m[0] / 255, +m[1] / 255, +m[2] / 255]
  return [0.95, 0.95, 0.97]
}

export function GlassStage({
  lightRef, enabled, onStats,
}: {
  lightRef: React.MutableRefObject<LightState>
  /** Aus schaltet die Ebene ab und gibt das CSS-Glas wieder frei — der Vergleichsschalter. */
  enabled: boolean
  onStats?: (s: GlassStats) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statsRef = useRef(onStats)
  statsRef.current = onStats

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const root = document.documentElement

    if (!enabled) {
      root.classList.remove('glass-gl-active')
      return
    }

    // „Transparenz reduzieren" heißt: keine durchsichtigen Materialien. Dann
    // hat eine Brechungsebene keine Berechtigung — CSS übernimmt, und das
    // heutige @media-Regelwerk in index.css greift wie bisher.
    if (matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      root.classList.remove('glass-gl-active')
      return
    }

    let gl: WebGL2RenderingContext | null = null
    let prog: WebGLProgram | null = null
    let loc: Record<string, WebGLUniformLocation | null> = {}
    let raf = 0
    let awakeUntil = performance.now() + IDLE_AFTER_MS
    let lost = false
    let rendererName = 'unbekannt'

    const shapeBuf = new Float32Array(MAX_SHAPES * 4)
    const extraBuf = new Float32Array(MAX_SHAPES * 2)
    const frameTimes: number[] = []
    let lastFrame = performance.now()
    let acc = { rect: 0, style: 0, draw: 0, n: 0 }
    let lastReport = performance.now()
    let drawCount = 0

    function build(): boolean {
      const ctx = canvas!.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' })
      if (!ctx) return false
      gl = ctx
      const mk = (t: number, src: string) => {
        const s = ctx.createShader(t)!
        ctx.shaderSource(s, src)
        ctx.compileShader(s)
        if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(s) ?? '')
        return s
      }
      try {
        prog = ctx.createProgram()!
        ctx.attachShader(prog, mk(ctx.VERTEX_SHADER, GLASS_VERT))
        ctx.attachShader(prog, mk(ctx.FRAGMENT_SHADER, APP_GLASS_FRAG))
        ctx.linkProgram(prog)
        if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(prog) ?? '')
      } catch {
        return false
      }
      ctx.useProgram(prog)
      ctx.bindVertexArray(ctx.createVertexArray())
      ctx.bindBuffer(ctx.ARRAY_BUFFER, ctx.createBuffer())
      ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW)
      const a = ctx.getAttribLocation(prog, 'aPos')
      ctx.enableVertexAttribArray(a)
      ctx.vertexAttribPointer(a, 2, ctx.FLOAT, false, 0, 0)
      // Wer zeichnet hier eigentlich? Ohne diese Auskunft kann man die
      // Zeitwerte unten nicht einordnen: ein Software-Rasterisierer ist um
      // Groessenordnungen langsamer als jede echte Grafikeinheit, und eine
      // Entscheidung auf Basis solcher Zahlen waere schlicht falsch.
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
      rendererName = (dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)) || 'unbekannt'
      const u = (n: string) => ctx.getUniformLocation(prog!, n)
      loc = {
        resolution: u('uResolution'), time: u('uTime'), light: u('uLight'),
        bulge: u('uBulge'), profile: u('uProfile'), ior: u('uIor'), depth: u('uDepth'),
        dispersion: u('uDispersion'), roughness: u('uRoughness'), specular: u('uSpecular'),
        fresnel: u('uFresnel'), caustic: u('uCaustic'), tint: u('uTint'),
        tintStrength: u('uTintStrength'), shadow: u('uShadow'),
        shapeCount: u('uShapeCount'), shapes: u('uShapes[0]'), shapeExtra: u('uShapeExtra[0]'),
        merge: u('uMerge'),
        bgColor: u('uBgColor'), sectionColor: u('uSectionColor'),
        gradientHeight: u('uGradientHeight'), gradientPeak: u('uGradientPeak'),
        gradientAlpha: u('uGradientAlpha'),
        ringCenter: u('uRingCenter'), ringRadius: u('uRingRadius'), ringAlpha: u('uRingAlpha'),
        ringColors: u('uRingColors[0]'),
        veilColor: u('uVeilColor'), veilAlpha: u('uVeilAlpha'),
      }
      return true
    }

    if (!build()) {
      root.classList.remove('glass-gl-active')
      return
    }
    root.classList.add('glass-gl-active')

    const wake = () => {
      awakeUntil = performance.now() + IDLE_AFTER_MS
      if (!raf && !lost) {
        lastFrame = performance.now()
        raf = requestAnimationFrame(render)
      }
    }
    setWakeHandler(wake)

    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
      cancelAnimationFrame(raf)
      raf = 0
      // Klasse weg ⇒ das CSS-Glas erscheint sofort wieder. Der Nutzer sieht
      // im schlimmsten Fall einen Materialwechsel, keine leere Fläche.
      root.classList.remove('glass-gl-active')
    }
    const onRestored = () => {
      lost = false
      if (build()) {
        root.classList.add('glass-gl-active')
        wake()
      }
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    const P = GLASS_PRESETS.appGlas
    const ringCols = new Float32Array(12)
    const start = performance.now()

    function render(now: number) {
      raf = 0
      if (!gl || lost) return
      const dt = now - lastFrame
      lastFrame = now
      frameTimes.push(dt)
      if (frameTimes.length > 90) frameTimes.shift()

      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(window.innerWidth * dpr))
      const h = Math.max(1, Math.round(window.innerHeight * dpr))
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w
        canvas!.height = h
      }
      gl.viewport(0, 0, w, h)

      // --- Tokens lesen -----------------------------------------------------
      // Einmal getComputedStyle pro Frame. Muss pro Frame sein, weil
      // --color-section seit v1.14.1 über 400 ms überblendet — würde man es
      // seltener lesen, ruckelte der Hintergrund beim Seitenwechsel.
      const t0 = performance.now()
      const cs = getComputedStyle(document.body)
      const bg = parseColor(cs.getPropertyValue('--color-bg'))
      const sec = parseColor(cs.getPropertyValue('--color-section'))
      const surf = parseColor(cs.getPropertyValue('--color-surface'))
      const macros: [number, number, number][] = [
        parseColor(cs.getPropertyValue('--color-kcal')),
        parseColor(cs.getPropertyValue('--color-protein')),
        parseColor(cs.getPropertyValue('--color-carbs')),
        parseColor(cs.getPropertyValue('--color-fat')),
      ]
      for (let i = 0; i < 4; i++) ringCols.set(macros[i], i * 3)
      const t1 = performance.now()

      // --- Flächen lesen ----------------------------------------------------
      const n = readSurfaces(shapeBuf, extraBuf, MAX_SHAPES, dpr)
      const t2 = performance.now()

      const L = lightRef.current
      gl.uniform2f(loc.resolution!, w, h)
      gl.uniform1f(loc.time!, (now - start) / 1000)
      gl.uniform3f(loc.light!, L.x, -L.y, L.z)
      gl.uniform1f(loc.bulge!, P.bulge)
      gl.uniform1f(loc.profile!, P.profile)
      gl.uniform1f(loc.ior!, P.ior)
      gl.uniform1f(loc.depth!, P.depth * dpr)
      gl.uniform1f(loc.dispersion!, P.dispersion)
      gl.uniform1f(loc.roughness!, P.roughness)
      gl.uniform1f(loc.specular!, P.specular)
      gl.uniform1f(loc.fresnel!, P.fresnel)
      gl.uniform1f(loc.caustic!, 0)
      gl.uniform3f(loc.tint!, P.tint[0], P.tint[1], P.tint[2])
      gl.uniform1f(loc.tintStrength!, P.tintStrength)
      gl.uniform1f(loc.shadow!, P.shadow)
      gl.uniform1i(loc.shapeCount!, n)
      gl.uniform4fv(loc.shapes!, shapeBuf)
      gl.uniform2fv(loc.shapeExtra!, extraBuf)
      gl.uniform1f(loc.merge!, 0)
      gl.uniform3f(loc.bgColor!, bg[0], bg[1], bg[2])
      gl.uniform3f(loc.sectionColor!, sec[0], sec[1], sec[2])
      // Spiegelt .top-gradient und TopGradient.tsx aus index.css
      gl.uniform1f(loc.gradientHeight!, window.innerHeight * 0.5 * dpr)
      gl.uniform1f(loc.gradientPeak!, 0.48)
      gl.uniform1f(loc.gradientAlpha!, 0.6)
      // Spiegelt .background-rings: 22rem, translate(30%,32%), Deckkraft 0.48
      const ringSize = 22 * 16 * dpr
      gl.uniform2f(loc.ringCenter!, w - ringSize * 0.2, h - ringSize * 0.18)
      gl.uniform1f(loc.ringRadius!, ringSize * 0.46)
      gl.uniform1f(loc.ringAlpha!, 0.26)
      gl.uniform3fv(loc.ringColors!, ringCols)
      gl.uniform3f(loc.veilColor!, surf[0], surf[1], surf[2])
      // 0.45 statt der 0.55 aus .glass-subtle: die Brechung liefert hier
      // bereits einen Teil der Aufhellung, die dort der Weichzeichner macht.
      gl.uniform1f(loc.veilAlpha!, 0.45)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
      drawCount++
      const t3 = performance.now()

      acc.style += t1 - t0
      acc.rect += t2 - t1
      acc.draw += t3 - t2
      acc.n++

      const idle = now > awakeUntil
      // Beim Übergang in die Ruhe wird IMMER gemeldet, auch außerhalb des
      // 400-ms-Fensters — sonst bliebe die letzte Anzeige auf "zeichnet"
      // stehen, obwohl die Schleife längst hält.
      if ((idle || now - lastReport > 400) && statsRef.current && acc.n > 0) {
        const sorted = [...frameTimes].sort((a, b) => a - b)
        statsRef.current({
          fps: frameTimes.length > 1 ? 1000 / (frameTimes.reduce((s, v) => s + v, 0) / frameTimes.length) : 0,
          frameP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          styleMs: acc.style / acc.n,
          rectMs: acc.rect / acc.n,
          drawMs: acc.draw / acc.n,
          shapes: n,
          idle,
          frames: drawCount,
          renderer: rendererName,
        })
        acc = { rect: 0, style: 0, draw: 0, n: 0 }
        lastReport = now
      }

      // Ruhe: die Schleife hält an, statt ein unverändertes Bild zu wiederholen.
      if (!idle) raf = requestAnimationFrame(render)
    }

    const events: (keyof WindowEventMap)[] = ['pointermove', 'scroll', 'resize', 'orientationchange', 'pointerdown']
    for (const e of events) window.addEventListener(e, wake, { passive: true, capture: e === 'scroll' })
    const mo = new MutationObserver(wake)
    // Der Routenwechsel blendet --color-section 400 ms lang über. Ohne diesen
    // Anstoß bliebe die Ebene im Ruhezustand und der Hintergrund spränge.
    mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] })

    wake()

    return () => {
      cancelAnimationFrame(raf)
      setWakeHandler(() => {})
      for (const e of events) window.removeEventListener(e, wake, { capture: e === 'scroll' } as EventListenerOptions)
      mo.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      root.classList.remove('glass-gl-active')
      if (gl && prog) gl.deleteProgram(prog)
    }
  }, [enabled, lightRef])

  return (
    <>
      {/* Solange die Ebene läuft, tritt das CSS-Glas zurück. Als <style> hier
          statt in index.css, weil der Prototyp nichts an der App ändern soll. */}
      <style>{`
        .glass-gl-active .gl-surface {
          background: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none !important;
          border-color: transparent !important;
          animation: none !important;
        }
        /* Der Shader zeichnet Verlauf und Ringe selbst — die CSS-Fassungen
           muessen weichen, sonst liegen beide uebereinander. */
        .glass-gl-active .top-gradient,
        .glass-gl-active .background-rings { display: none !important; }
      `}</style>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ display: enabled ? 'block' : 'none', width: '100%', height: '100%' }}
      />
    </>
  )
}
