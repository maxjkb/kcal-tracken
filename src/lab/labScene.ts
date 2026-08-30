/**
 * Die gemeinsame Bühne, auf der alle drei Stufen dasselbe zeigen.
 *
 * Der Hintergrund ist der Punkt: Glas ohne etwas dahinter lässt sich optisch
 * nicht beurteilen. Damit der Vergleich fair ist, muss jede Stufe über
 * demselben Motiv liegen — die CSS- und die SVG-Stufe bekommen es als
 * CSS-Verlauf, die WebGL-Stufe rechnet es im Shader nach (scene() in
 * glassShader.ts). Beide Fassungen sind hier nebeneinander definiert, damit
 * sie nicht auseinanderlaufen.
 */

export type SceneMode = 'app' | 'grid' | 'blobs'

export const SCENE_LABELS: Record<SceneMode, string> = {
  app: 'App-Look',
  grid: 'Prüfraster',
  blobs: 'Farbfelder',
}

export const SCENE_HINTS: Record<SceneMode, string> = {
  app: 'Der echte Hintergrund von Tracke — Verlauf plus Nährwertringe.',
  grid: 'Gerade Linien machen jede Verzerrung sofort sichtbar. Der ehrlichste Test.',
  blobs: 'Harte Farbkanten zeigen die Dispersion (Farbsäume) am deutlichsten.',
}

/** Reihenfolge im Shader-Uniform uSceneMode. */
export const SCENE_MODE_INDEX: Record<SceneMode, number> = { app: 0, grid: 1, blobs: 2 }

/**
 * Der Hintergrund als CSS. Wird sowohl auf die Bühne selbst gelegt als auch
 * — mit negativem background-position — INNEN in jede Glasform kopiert: nur
 * so hat die SVG-Stufe überhaupt etwas zum Brechen, das auch auf iOS
 * ankommt (backdrop-filter: url(#…) unterstützt Safari nicht).
 */
export function sceneBackground(mode: SceneMode): string {
  if (mode === 'grid') {
    return [
      'repeating-linear-gradient(0deg, rgba(255,255,255,.55) 0 1.5px, transparent 1.5px 44px)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 1.5px, transparent 1.5px 44px)',
      'repeating-linear-gradient(0deg, rgba(255,255,255,.85) 0 2.5px, transparent 2.5px 220px)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,.85) 0 2.5px, transparent 2.5px 220px)',
      'linear-gradient(180deg, #175CC7 0%, #f7f9ff 100%)',
    ].join(',')
  }
  if (mode === 'blobs') {
    return [
      'radial-gradient(closest-side at 25% 25%, #1E90FF 0%, transparent 100%)',
      'radial-gradient(closest-side at 80% 30%, #FF9500 0%, transparent 100%)',
      'radial-gradient(closest-side at 30% 82%, #34C759 0%, transparent 100%)',
      'radial-gradient(closest-side at 78% 78%, #AF52DE 0%, transparent 100%)',
      'linear-gradient(180deg, #f7f9ff 0%, #eef3fb 100%)',
    ].join(',')
  }
  return [
    'radial-gradient(closest-side at 82% 86%, rgba(30,144,255,.30) 62%, transparent 100%)',
    'radial-gradient(closest-side at 82% 86%, rgba(255,55,95,.26) 48%, transparent 82%)',
    'radial-gradient(closest-side at 82% 86%, rgba(52,199,89,.24) 34%, transparent 62%)',
    'radial-gradient(closest-side at 82% 86%, rgba(255,204,0,.24) 20%, transparent 44%)',
    'linear-gradient(180deg, #6BA9F5 0%, #f2f2f7 62%)',
  ].join(',')
}

/** Eine Form auf der Bühne. Kreis, wenn cornerRadius ≥ halbe Kantenlänge. */
export interface GlassShape {
  id: string
  /** Mittelpunkt in Bühnen-Pixeln. */
  x: number
  y: number
  w: number
  h: number
  /** Eckradius in px. */
  cornerRadius: number
  /**
   * Wie weit die Wölbung vom Rand nach innen reicht, in px.
   * Beim Tropfen = Radius (durchgehende Kuppel). Bei einer UI-Fläche viel
   * kleiner — dann bleibt die Mitte flach und nur die Kante ist angeschrägt,
   * was Text darauf lesbar hält.
   */
  rimWidth: number
  label?: string
}

/** Kreis-Kurzform. */
export function droplet(id: string, x: number, y: number, r: number, label?: string): GlassShape {
  return { id, x, y, w: r * 2, h: r * 2, cornerRadius: r, rimWidth: r, label }
}

/** UI-Fläche: flache Mitte, angeschrägte Kante. */
export function panel(
  id: string, x: number, y: number, w: number, h: number, cornerRadius: number, rimWidth = 26, label?: string,
): GlassShape {
  return { id, x, y, w, h, cornerRadius, rimWidth, label }
}
