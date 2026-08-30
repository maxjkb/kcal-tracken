import type { CSSProperties } from 'react'
import { fresnelSchlick, shininessFromRoughness, type GlassParams } from './glassPhysics'
import type { GlassShape } from './labScene'

/**
 * Stufe 1 — reines CSS.
 *
 * Was hier geht: Wölbung andeuten (Verläufe), Rand aufhellen (inset-Schatten),
 * Glanzlicht setzen (radialer Verlauf an der Lichtposition), den Hintergrund
 * weichzeichnen und sättigen (backdrop-filter).
 *
 * Was hier NICHT geht, und das ist der ganze Punkt dieser Stufe: echte
 * Brechung. CSS kann den Hintergrund nicht ortsabhängig verschieben. Es gibt
 * keine Lupenwirkung, keinen umgeklappten Rand, keine Farbsäume — nur eine
 * gleichmäßige Weichzeichnung plus gemalte Lichter. Deshalb sieht CSS-Glas
 * bei kleinen Flächen überzeugend und bei großen wie Milchglas aus.
 *
 * Die Zahlen kommen trotzdem aus dem echten Physik-Kern: der Rand wird über
 * fresnelSchlick() aufgehellt, die Glanzlichtgröße über
 * shininessFromRoughness(). Was gemalt wird, ist also wenigstens an der
 * richtigen Stelle und in der richtigen Stärke.
 */
export function GlassCSS({ shape, params, children }: { shape: GlassShape; params: GlassParams; children?: React.ReactNode }) {
  // Der Rand eines gewölbten Körpers steht steil ⇒ streifender Blick ⇒ hoher
  // Fresnel-Anteil. cos θ am Rand nähern wir mit (1 − bulge).
  const rimF = fresnelSchlick(Math.max(0.05, 1 - params.bulge), params.ior) * params.fresnel
  // Die Größe des Glanzflecks folgt derselben Rauheits-Umrechnung wie in den
  // anderen Stufen — nur dass hier ein Verlauf daraus wird statt eines
  // Exponenten im Shader.
  const specSize = Math.max(6, 46 / Math.pow(shininessFromRoughness(params.roughness), 0.22))
  const tintRgb = params.tint.map((c) => Math.round(c * 255)).join(',')

  // Wie stark der Hintergrund verwaschen wird. An echte Brechung kommt das
  // nicht heran, aber die Abhängigkeit von Dicke und Brechungsindex ist
  // wenigstens dieselbe Richtung wie in der Physik.
  const blurPx = (params.depth * params.bulge * (params.ior - 1)) * 0.42

  const style: CSSProperties = {
    position: 'absolute',
    left: shape.x - shape.w / 2,
    top: shape.y - shape.h / 2,
    width: shape.w,
    height: shape.h,
    borderRadius: shape.cornerRadius,
    backdropFilter: `blur(${blurPx.toFixed(1)}px) saturate(${(1 + params.ior * 0.35).toFixed(2)}) brightness(1.04)`,
    WebkitBackdropFilter: `blur(${blurPx.toFixed(1)}px) saturate(${(1 + params.ior * 0.35).toFixed(2)}) brightness(1.04)`,
    background: [
      // Glanzlicht — sitzt an der Lichtposition (--lpx/--lpy aus useLightSource)
      `radial-gradient(circle ${specSize}px at var(--lpx,32%) var(--lpy,26%), rgba(255,255,255,${(0.95 * params.specular).toFixed(2)}) 0%, rgba(255,255,255,0) 100%)`,
      // Breiteres Umfeldlicht — ohne das wirkt die Oberfläche wie Plastik
      `radial-gradient(circle ${(specSize * 4).toFixed(0)}px at var(--lpx,32%) var(--lpy,26%), rgba(255,255,255,${(0.28 * params.specular).toFixed(2)}) 0%, rgba(255,255,255,0) 100%)`,
      // Fresnel-Saum: zur Mitte hin durchsichtig, zum Rand hin Spiegel
      `radial-gradient(closest-side, rgba(255,255,255,0) 58%, rgba(255,255,255,${(rimF * 0.72).toFixed(2)}) 93%, rgba(255,255,255,${(rimF * 0.22).toFixed(2)}) 100%)`,
      // Eigenfarbe des Glases
      `linear-gradient(rgba(${tintRgb},${(params.tintStrength * 0.55).toFixed(2)}), rgba(${tintRgb},${(params.tintStrength * 0.28).toFixed(2)}))`,
    ].join(','),
    boxShadow: [
      // Kontaktschatten, dem Licht gegenüber
      `calc(var(--lx,-0.7) * -${(shape.rimWidth * 0.22).toFixed(0)}px) calc(var(--ly,0.7) * ${(shape.rimWidth * 0.22).toFixed(0)}px) ${(shape.rimWidth * 0.5).toFixed(0)}px rgba(12,32,60,${(0.3 * params.shadow).toFixed(2)})`,
      // Helle Innenkante zum Licht hin, dunkle Innenkante gegenüber — das
      // ist die gesamte "Dicke", die CSS darstellen kann.
      `inset calc(var(--lx,-0.7) * ${(shape.rimWidth * 0.16).toFixed(0)}px) calc(var(--ly,0.7) * -${(shape.rimWidth * 0.16).toFixed(0)}px) ${(shape.rimWidth * 0.5).toFixed(0)}px rgba(255,255,255,${(0.6 * rimF).toFixed(2)})`,
      `inset calc(var(--lx,-0.7) * -${(shape.rimWidth * 0.14).toFixed(0)}px) calc(var(--ly,0.7) * ${(shape.rimWidth * 0.14).toFixed(0)}px) ${(shape.rimWidth * 0.45).toFixed(0)}px rgba(10,35,70,0.14)`,
      `inset 0 0 0 1px rgba(255,255,255,${(0.5 * rimF).toFixed(2)})`,
    ].join(','),
  }

  return <div style={style}>{children}</div>
}
