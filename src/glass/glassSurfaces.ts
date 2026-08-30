import { useLayoutEffect, useRef } from 'react'

/**
 * Das Bindeglied zwischen DOM und Shader.
 *
 * Eine Glasfläche ist im Prototyp weiterhin ein ganz normales DOM-Element —
 * es trägt seinen Text, seine Icons, seine Klickziele und sein Layout wie
 * bisher. Nur seine SICHTBARE Fläche zeichnet es nicht mehr selbst, sondern
 * meldet sie hier an, und die WebGL-Ebene dahinter malt sie.
 *
 * Warum die Position pro Frame gelesen wird und nicht beim Anmelden: die
 * Flächen liegen im normalen Fluss und wandern beim Scrollen. Ein
 * ResizeObserver meldet nur Größen-, kein Positionsänderungen, und ein
 * Scroll-Listener käme zu spät für denselben Frame. getBoundingClientRect()
 * in der Schleife ist der einzige Weg, der garantiert synchron zum Bild ist —
 * er kostet einen Layout-Abgleich pro Frame, aber nur einen, weil in der
 * Schleife ausschließlich gelesen und nie geschrieben wird.
 */

export interface GlassSurface {
  el: HTMLElement
  /** Wie weit die Wölbung von der Kante nach innen reicht, in px. */
  rim: number
  /** Eckradius in px. Wird beim Anmelden aus dem berechneten Stil gelesen. */
  cornerRadius: number
}

const surfaces = new Set<GlassSurface>()

/** Wird gerufen, wenn sich etwas geändert hat, das ein neues Bild nötig macht. */
let wake: () => void = () => {}
export function setWakeHandler(fn: () => void) {
  wake = fn
}

/**
 * Öffentlicher Weckruf für Bewegung, die GlassStage sonst nicht hört.
 *
 * Die Ebene wacht selbst schon bei Zeiger-/Scroll-/Größenänderungen auf —
 * aber ein Tab-Wechsel per Antippen (statt Wischen) verschiebt jede Fläche
 * der Seite über eine reine Motion-Animation (SwipeNavigator), ganz ohne
 * Zeiger-Ereignis währenddessen. Ohne diesen Aufruf blieben die Flächen für
 * die Dauer der Übergangsanimation an ihrer alten Position eingefroren — bei
 * jedem einzelnen Tab-Wechsel, der häufigsten Navigation der App. App.tsx
 * ruft das bei jedem Bereichswechsel auf; ein No-Op, solange GlassStage noch
 * nicht gemountet hat (der Standard-Handler oben tut nichts).
 */
export function wakeGlass() {
  wake()
}

export function registerSurface(el: HTMLElement, rim: number): () => void {
  // Einmal beim Anmelden aus dem Stil gelesen statt pro Frame: der Eckradius
  // eines Bedienelements ändert sich nicht, und getComputedStyle ist deutlich
  // teurer als getBoundingClientRect.
  const cs = getComputedStyle(el)
  const cr = parseFloat(cs.borderTopLeftRadius) || 0
  const entry: GlassSurface = { el, rim, cornerRadius: cr }
  surfaces.add(entry)
  wake()
  return () => {
    surfaces.delete(entry)
    wake()
  }
}

/** Anzahl der Flächen, die die Ebene gerade zeichnen müsste. */
export function surfaceCount(): number {
  return surfaces.size
}

/**
 * Liest alle sichtbaren Flächen in die Uniform-Puffer.
 *
 * Flächen außerhalb des Sichtfelds werden übersprungen — auf der Feed-Seite
 * sind das beim Scrollen die meisten, und jede eingesparte Form spart im
 * Shader fünf Distanzfeld-Auswertungen pro Pixel.
 *
 * @returns wie viele Formen tatsächlich eingetragen wurden.
 */
export function readSurfaces(
  shapes: Float32Array, extra: Float32Array, max: number, dpr: number,
): number {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let n = 0
  for (const s of surfaces) {
    if (n >= max) break
    const r = s.el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (r.bottom < -40 || r.top > vh + 40 || r.right < -40 || r.left > vw + 40) continue
    shapes[n * 4] = (r.left + r.width / 2) * dpr
    shapes[n * 4 + 1] = (r.top + r.height / 2) * dpr
    shapes[n * 4 + 2] = (r.width / 2) * dpr
    // w < 0 heißt Kreis. Hier immer ein abgerundetes Rechteck — ein Kreis ist
    // davon nur der Sonderfall mit cornerRadius = halbe Kantenlänge.
    shapes[n * 4 + 3] = (r.height / 2) * dpr
    extra[n * 2] = s.rim * dpr
    extra[n * 2 + 1] = Math.min(s.cornerRadius, Math.min(r.width, r.height) / 2) * dpr
    n++
  }
  return n
}

/**
 * Meldet ein Element als Glasfläche an.
 *
 * `rim` ist der einzige Regler, der hier wirklich zählt: er bestimmt, wie weit
 * die Wölbung von der Kante nach innen reicht. Klein halten — bleibt die Mitte
 * flach, wird der Hintergrund dort unverzerrt durchgereicht und Text darüber
 * bleibt ruhig. Eine durchgehende Kuppel (rim = halbe Breite) sieht als
 * Wassertropfen gut aus und als Karte unbrauchbar.
 */
export function useGlassSurface<T extends HTMLElement>(rim = 22) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    return registerSurface(el, rim)
  }, [rim])
  return ref
}

/**
 * Für Flächen, die erst NACH ihrer aufrufenden Komponente selbst entstehen —
 * ein `AnimatePresence`-Popup, dessen `motion.div` erst mountet, wenn eine
 * Auswahl getroffen wird. useGlassSurface() allein reicht dafür nicht: sein
 * `useLayoutEffect` läuft einmal beim Mounten der aufrufenden Komponente,
 * lange bevor das Zielelement überhaupt existiert, und registriert dann
 * nichts. Diese Variante nimmt den DOM-Knoten direkt (typischerweise aus
 * einem `useState`, das ein Callback-Ref befüllt) und registriert neu, sooft
 * er wechselt — inklusive null beim Unmounten.
 */
export function useGlassSurfaceNode(node: HTMLElement | null, rim = 22) {
  useLayoutEffect(() => {
    if (!node) return
    return registerSurface(node, rim)
  }, [node, rim])
}
