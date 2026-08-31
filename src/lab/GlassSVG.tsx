import { useEffect, useMemo, useRef } from 'react'
import {
  refractionOffset, sdRoundBox, surfaceNormalFromEdge, heightFromEdge, type GlassParams,
} from '../glass/glassPhysics'
import { sceneBackground, type GlassShape, type SceneMode } from './labScene'
import type { LightState } from '../glass/useLightSource'

/**
 * Stufe 2 — SVG-Filter mit ECHTER Brechung.
 *
 * Der Trick, der das auf iOS überhaupt möglich macht: nicht
 * `backdrop-filter: url(#…)` (das kann Safari nicht), sondern eine KOPIE des
 * Hintergrunds innerhalb der Form, passgenau positioniert, auf die dann ein
 * ganz normaler `filter:` wirkt. Optisch nicht zu unterscheiden, solange man
 * weiß, was hinter der Fläche liegt — und das weiß man im eigenen Layout
 * immer.
 *
 * Die Filterkette:
 *
 *   feImage(Versatzkarte) ─┐
 *                          ├─ feDisplacementMap  → echte Brechung
 *   Hintergrundkopie ──────┘
 *   feImage(Höhenkarte) ── feSpecularLighting(fePointLight) → 3-D-Glanzlicht
 *   beides ─────────────── feComposite → Ergebnis
 *
 * Zwei Dinge sind hier entscheidend:
 *
 * 1. Die Versatzkarte wird EINMAL aus dem Physik-Kern berechnet
 *    (refractionOffset ⇒ R/G-Kanal) und ändert sich nie — sie hängt nur von
 *    Form und Material ab, nicht vom Licht.
 * 2. Das Licht bewegt sich trotzdem flüssig, weil fePointLight nur drei
 *    Attribute hat, die man pro Frame setzen kann. Kein Neuberechnen, kein
 *    Neuzeichnen der Karte.
 *
 * Was gegenüber WebGL fehlt: die Dispersion. feDisplacementMap verschiebt
 * alle drei Farbkanäle gemeinsam. Man könnte die Kette dreimal mit leicht
 * unterschiedlicher scale laufen lassen und über feColorMatrix wieder
 * zusammensetzen — hier bewusst nicht gemacht, damit sichtbar bleibt, wo die
 * Grenze dieser Stufe liegt.
 */

interface Maps {
  displacement: string
  height: string
  /** Maximaler Versatz in px — daraus ergibt sich die scale des feDisplacementMap. */
  maxOffset: number
  width: number
  height2: number
  pad: number
}

/**
 * Erzeugt Versatz- und Höhenkarte auf einem Canvas.
 *
 * Zwei getrennte Bilder statt eines kombinierten: SVG-Filter rechnen
 * standardmäßig mit vormultipliziertem Alpha, und ein Bild, dessen R/G die
 * Nutzdaten trägt und dessen Alpha gleichzeitig variiert, würde dabei still
 * verfälscht. Die Versatzkarte ist deshalb überall deckend.
 */
function buildMaps(shape: GlassShape, params: GlassParams): Maps {
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

  // Erster Durchgang: Versatz sammeln, um den Maximalwert zu kennen (die
  // scale des Filters muss darauf normiert sein).
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
      // Gradient des Distanzfeldes per zentraler Differenz — für ein
      // abgerundetes Rechteck gibt es keine geschlossene Form, die überall
      // gilt (Ecken vs. Kanten), und numerisch ist es hier exakt genug.
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
    // 128 = kein Versatz. feDisplacementMap liest scale · (Kanal − 0.5).
    //
    // Ebenfalls gedithert, und hier ist es sogar noetiger als bei der
    // Hoehenkarte: maxOffset wird vom RAND bestimmt, wo die Versaetze am
    // groessten sind. In der Tropfenmitte sind sie winzig und landen damit
    // auf nur einer Handvoll der 255 Stufen — der glatte Hintergrund bekam
    // dadurch Stufen, sichtbar als konzentrische Ringe im Glanzlicht.
    const dith = () => Math.random() - 0.5
    dimg.data[p4] = Math.round(Math.max(0, Math.min(255, 128 + (offX[i] / maxOffset) * 127 + dith())))
    dimg.data[p4 + 1] = Math.round(Math.max(0, Math.min(255, 128 + (offY[i] / maxOffset) * 127 + dith())))
    dimg.data[p4 + 2] = 128
    dimg.data[p4 + 3] = 255
    himg.data[p4] = 255
    himg.data[p4 + 1] = 255
    himg.data[p4 + 2] = 255
    // Mit Dither quantisiert. Nahe der Kuppe aendert sich die Hoehe so
    // langsam, dass viele Pixel auf demselben Byte landen — feSpecularLighting
    // LEITET das Feld ab und macht aus jeder dieser Plateaugrenzen eine Rille,
    // sichtbar als Moire-Ringe im Glanzlicht. Ein halbes LSB Rauschen bricht
    // die Plateaus auf; die Weichzeichnung in der Filterkette mittelt es
    // wieder zu einem glatten Verlauf.
    himg.data[p4 + 3] = Math.round(Math.max(0, Math.min(255, heights[i] * 255 + (Math.random() - 0.5))))
  }

  dctx.putImageData(dimg, 0, 0)
  hctx.putImageData(himg, 0, 0)
  return { displacement: disp.toDataURL(), height: hgt.toDataURL(), maxOffset, width: W, height2: H, pad }
}

export function GlassSVG({
  shape, params, scene, stage, lightRef, children,
}: {
  shape: GlassShape
  params: GlassParams
  scene: SceneMode
  stage: { w: number; h: number }
  lightRef: React.MutableRefObject<LightState>
  children?: React.ReactNode
}) {
  const filterId = `glass-svg-${shape.id}`
  const lightEl = useRef<SVGFEPointLightElement>(null)

  const maps = useMemo(() => buildMaps(shape, params), [shape, params])

  // Das Licht pro Frame ins fePointLight schreiben. Genau hier zahlt sich die
  // Trennung aus: die teuren Karten bleiben liegen, nur drei Zahlen wandern.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = lightEl.current
      if (el) {
        const L = lightRef.current
        const cx = maps.width / 2
        const cy = maps.height2 / 2
        const reach = Math.max(maps.width, maps.height2) * 0.9
        el.setAttribute('x', String(cx + L.x * reach))
        // Minus, weil die SVG-Y-Achse nach unten zeigt.
        el.setAttribute('y', String(cy - L.y * reach))
        // Mindestabstand ist ein guter Teil der Reichweite, nicht 24 px:
        // steht die Punktlichtquelle zu dicht ueber der Oberflaeche, saettigt
        // feSpecularLighting zu einer hart begrenzten weissen Scheibe — das
        // sah nach Darstellungsfehler aus, nicht nach Glanzlicht.
        el.setAttribute('z', String(Math.max(reach * 0.45, L.z * reach * 0.75)))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lightRef, maps])

  const left = shape.x - shape.w / 2
  const top = shape.y - shape.h / 2

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: shape.w,
        height: shape.h,
        borderRadius: shape.cornerRadius,
        overflow: 'hidden',
        // Der Kontaktschatten liegt außen und darf deshalb nicht mitgeschnitten
        // werden — er sitzt auf diesem Element, nicht im Filter.
        boxShadow: `calc(var(--lx,-0.7) * -${(shape.rimWidth * 0.2).toFixed(0)}px) calc(var(--ly,0.7) * ${(shape.rimWidth * 0.2).toFixed(0)}px) ${(shape.rimWidth * 0.55).toFixed(0)}px rgba(12,32,60,${(0.32 * params.shadow).toFixed(2)})`,
        isolation: 'isolate',
      }}
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
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
            <feImage
              href={maps.displacement}
              x="0"
              y="0"
              width={maps.width}
              height={maps.height2}
              preserveAspectRatio="none"
              result="DISP"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="DISP"
              scale={2 * maps.maxOffset}
              xChannelSelector="R"
              yChannelSelector="G"
              result="REFRACTED"
            />
            <feImage
              href={maps.height}
              x="0"
              y="0"
              width={maps.width}
              height={maps.height2}
              preserveAspectRatio="none"
              result="HEIGHT"
            />
            {/* Die Höhenkarte hat nur 8 Bit Alpha. feSpecularLighting
                LEITET dieses Feld ab, um seine Normalen zu bekommen — und
                eine Ableitung macht aus jeder Quantisierungsstufe eine
                sichtbare Rille. Im Glanzlicht sah man das als Moiré-Ringe.
                Ein knappes Weichzeichnen glättet die Stufen weg, ohne die
                Form nennenswert zu verändern. */}
            <feGaussianBlur in="HEIGHT" stdDeviation="2.2" result="HEIGHT_S" />
            {/* Echtes 3-D-Licht: feSpecularLighting liest den Alphakanal als
                Höhenfeld und beleuchtet es mit einer im Raum stehenden
                Punktlichtquelle. */}
            <feSpecularLighting
              in="HEIGHT_S"
              surfaceScale={params.bulge * shape.rimWidth * 0.55}
              specularConstant={params.specular}
              specularExponent={Math.max(1, 60 * (1 - params.roughness))}
              lightingColor="#ffffff"
              result="SPEC"
            >
              <fePointLight ref={lightEl} x={0} y={0} z={120} />
            </feSpecularLighting>
            <feComposite in="SPEC" in2="HEIGHT" operator="in" result="SPEC_MASKED" />
            <feComposite
              in="REFRACTED"
              in2="SPEC_MASKED"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
            />
          </filter>
        </defs>
      </svg>

      {/* Die Hintergrundkopie. Negatives background-position rückt sie exakt
          dorthin, wo der echte Hintergrund hinter dieser Form liegt — das ist
          der ganze Grund, warum die Brechung stimmt statt nur "irgendetwas zu
          verzerren". */}
      <div
        style={{
          position: 'absolute',
          left: -maps.pad,
          top: -maps.pad,
          width: maps.width,
          height: maps.height2,
          filter: `url(#${filterId})`,
          background: sceneBackground(scene),
          backgroundSize: `${stage.w}px ${stage.h}px`,
          backgroundPosition: `${-(left - maps.pad)}px ${-(top - maps.pad)}px`,
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Eigenfarbe und Fresnel-Saum liegen als dünne CSS-Schicht darüber:
          beides ist eine reine Einfärbung, die kein Filter braucht. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: shape.cornerRadius,
          pointerEvents: 'none',
          background: `radial-gradient(closest-side, rgba(255,255,255,0) 62%, rgba(255,255,255,${(0.5 * params.fresnel).toFixed(2)}) 94%, rgba(255,255,255,${(0.16 * params.fresnel).toFixed(2)}) 100%),
            linear-gradient(rgba(${params.tint.map((c) => Math.round(c * 255)).join(',')},${(params.tintStrength * 0.4).toFixed(2)}), rgba(${params.tint.map((c) => Math.round(c * 255)).join(',')},${(params.tintStrength * 0.2).toFixed(2)}))`,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,${(0.45 * params.fresnel).toFixed(2)})`,
        }}
      />
      {children}
    </div>
  )
}
