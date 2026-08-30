import { useEffect, useRef } from 'react'
import { GLASS_FRAG, GLASS_VERT } from './glassShader'
import type { GlassParams } from './glassPhysics'
import { SCENE_MODE_INDEX, type GlassShape, type SceneMode } from './labScene'
import type { LightState } from './useLightSource'

/**
 * Stufe 3 — WebGL, ein Fragment-Shader pro Pixel.
 *
 * Anders als die beiden anderen Stufen ist das hier KEIN Element pro Form:
 * ein einziges Canvas zeichnet Hintergrund und alle Glasformen zusammen.
 * Das ist keine Bequemlichkeit, sondern der Grund, warum diese Stufe Dinge
 * kann, die die anderen nicht können:
 *
 *  - Dispersion — Rot, Grün und Blau werden an drei verschiedenen Stellen
 *    abgetastet. Braucht drei unabhängige Brechungsrechnungen pro Pixel.
 *  - Verschmelzen — zwei Tropfen, die sich nähern, laufen über ein weiches
 *    Minimum der Distanzfelder ineinander, wie es Oberflächenspannung tut.
 *    Geht nur, wenn alle Formen dasselbe Feld teilen.
 *  - Kaustik und Schatten liegen AUSSERHALB der Form. Ein DOM-Element, das
 *    an seiner eigenen Kante endet, kann daneben nichts zeichnen.
 *
 * Der Preis: der Hintergrund muss dem Shader bekannt sein. Hier wird er
 * prozedural nachgebaut (scene() in glassShader.ts). In einer echten App
 * müsste man den darunterliegenden Inhalt in eine Textur rendern — und genau
 * das ist der Haken, der diese Stufe für allgemeines UI unpraktisch macht.
 */

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Shader liess sich nicht uebersetzen: ${log}`)
  }
  return sh
}

export function GlassWebGL({
  shapes, params, scene, merge, lightRef, className, onError,
}: {
  shapes: GlassShape[]
  params: GlassParams
  scene: SceneMode
  /** Verschmelzung benachbarter Formen, 0..1. */
  merge: number
  lightRef: React.MutableRefObject<LightState>
  className?: string
  onError?: (message: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Über Refs statt Abhängigkeiten der Effekt-Funktion: die Schleife läuft
  // durchgehend und liest jeden Frame den aktuellen Stand — ein Neuaufsetzen
  // des WebGL-Kontexts bei jeder Regleränderung wäre absurd teuer.
  const liveRef = useRef({ shapes, params, scene, merge })
  liveRef.current = { shapes, params, scene, merge }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false })
    if (!gl) {
      onError?.('WebGL2 steht auf diesem Geraet nicht zur Verfuegung.')
      return
    }

    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, GLASS_VERT))
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, GLASS_FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) ?? 'unbekannt')
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err))
      return
    }
    gl.useProgram(prog)

    // Ein Vollbild-Dreieckspaar. Mehr Geometrie braucht ein Shader, der
    // ohnehin jedes Pixel selbst bestimmt, nicht.
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(prog, name)
    const loc = {
      resolution: u('uResolution'), time: u('uTime'), light: u('uLight'), sceneMode: u('uSceneMode'),
      bulge: u('uBulge'), profile: u('uProfile'), ior: u('uIor'), depth: u('uDepth'),
      dispersion: u('uDispersion'), roughness: u('uRoughness'), specular: u('uSpecular'),
      fresnel: u('uFresnel'), caustic: u('uCaustic'), tint: u('uTint'),
      tintStrength: u('uTintStrength'), shadow: u('uShadow'),
      shapeCount: u('uShapeCount'), shapes: u('uShapes[0]'), shapeExtra: u('uShapeExtra[0]'),
      merge: u('uMerge'),
    }

    const MAX = 12
    const shapeBuf = new Float32Array(MAX * 4)
    const extraBuf = new Float32Array(MAX * 2)
    let raf = 0
    const start = performance.now()

    const render = (now: number) => {
      const { shapes: sh, params: p, scene: sc, merge: mg } = liveRef.current
      const rect = canvas.getBoundingClientRect()
      // Auf 1.5 gedeckelt: ein Fragment-Shader mit ~60 SDF-Auswertungen pro
      // Pixel bei DPR 3 auf einem Telefon ist nichts, was man einem Akku
      // fuer eine Dekor-Flaeche zumuten sollte.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)

      const count = Math.min(MAX, sh.length)
      shapeBuf.fill(0)
      extraBuf.fill(0)
      for (let i = 0; i < count; i++) {
        const s = sh[i]
        const isCircle = s.cornerRadius >= Math.min(s.w, s.h) / 2 - 0.5 && Math.abs(s.w - s.h) < 0.5
        shapeBuf[i * 4] = s.x * dpr
        shapeBuf[i * 4 + 1] = s.y * dpr
        shapeBuf[i * 4 + 2] = (isCircle ? s.w / 2 : s.w / 2) * dpr
        shapeBuf[i * 4 + 3] = isCircle ? -1 : (s.h / 2) * dpr
        extraBuf[i * 2] = s.rimWidth * dpr
        extraBuf[i * 2 + 1] = s.cornerRadius * dpr
      }

      const L = lightRef.current
      gl.uniform2f(loc.resolution, w, h)
      gl.uniform1f(loc.time, (now - start) / 1000)
      // L.y wird gespiegelt: der Hook liefert eine Welt-Y-Achse (nach oben),
      // der Shader rechnet in Bildschirmkoordinaten (nach unten).
      gl.uniform3f(loc.light, L.x, -L.y, L.z)
      gl.uniform1i(loc.sceneMode, SCENE_MODE_INDEX[sc])
      gl.uniform1f(loc.bulge, p.bulge)
      gl.uniform1f(loc.profile, p.profile)
      gl.uniform1f(loc.ior, p.ior)
      gl.uniform1f(loc.depth, p.depth * dpr)
      gl.uniform1f(loc.dispersion, p.dispersion)
      gl.uniform1f(loc.roughness, p.roughness)
      gl.uniform1f(loc.specular, p.specular)
      gl.uniform1f(loc.fresnel, p.fresnel)
      gl.uniform1f(loc.caustic, p.caustic)
      gl.uniform3f(loc.tint, p.tint[0], p.tint[1], p.tint[2])
      gl.uniform1f(loc.tintStrength, p.tintStrength)
      gl.uniform1f(loc.shadow, p.shadow)
      gl.uniform1i(loc.shapeCount, count)
      gl.uniform4fv(loc.shapes, shapeBuf)
      gl.uniform2fv(loc.shapeExtra, extraBuf)
      gl.uniform1f(loc.merge, mg)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
      gl.deleteVertexArray(vao)
    }
  }, [lightRef, onError])

  return <canvas ref={canvasRef} className={className} style={{ display: 'block', width: '100%', height: '100%' }} />
}
