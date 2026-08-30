/**
 * Der gemeinsame Physik-/Optik-Kern des Glas-Baukastens.
 *
 * Hier steht die Mathematik EINMAL — als TypeScript (für die CSS- und
 * SVG-Stufe, die auf der CPU vorberechnen) und als GLSL-Quelltext (für die
 * WebGL-Stufe, die pro Pixel rechnet). Beide Fassungen bilden dieselben
 * Formeln ab, damit ein Vergleich der drei Stufen tatsächlich die
 * Render-Technik vergleicht und nicht drei verschiedene Näherungen.
 *
 * Modelliert wird ein Flüssigkeitstropfen auf einer Scheibe, von oben
 * betrachtet:
 *
 *   1. Höhenfeld       — die Wölbung des Tropfens (Oberflächenspannung)
 *   2. Normale         — die Ableitung daraus, das 3-D-Fundament für alles
 *   3. Brechung        — Snellius, echtes refract(), kein "Offset mal Faktor"
 *   4. Fresnel         — Schlick-Näherung, macht den Rand spiegelnd
 *   5. Glanzlicht      — Blinn-Phong aus derselben Normale
 *   6. Kaustik         — der Lichtfleck, den die Tropfenlinse darunter wirft
 *   7. Dispersion      — R/G/B brechen unterschiedlich stark (Farbsäume)
 *
 * Nichts hiervon greift auf das DOM zu — die Datei ist absichtlich rein,
 * damit sie sich testen und in jeder der drei Stufen wiederverwenden lässt.
 */

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

export interface GlassParams {
  /** Radius des Tropfens in px. */
  radius: number
  /**
   * Wölbung, 0..1 — wie hoch der Tropfen über der Scheibe steht.
   * 0 = flache Pfütze (kaum Brechung), 1 = Halbkugel (starke Lupe).
   */
  bulge: number
  /**
   * Randsteilheit (der Exponent p im Höhenprofil), 0.3..1.
   * 0.5 = exakte Kugelkalotte. Kleiner = flacherer Deckel mit steilerem
   * Rand, so wie echte Oberflächenspannung einen Tropfen formt.
   */
  profile: number
  /** Brechungsindex. Wasser 1.333, Kronglas 1.52, Diamant 2.42. */
  ior: number
  /**
   * Abstand Scheibe→Hintergrund in px. Bestimmt, wie weit der Hintergrund
   * verschoben wird — physikalisch der Hebel, an dem die Brechung ansetzt.
   */
  depth: number
  /** Dispersion: um wie viel der Brechungsindex zwischen Rot und Blau auseinanderliegt. 0 = keine Farbsäume. */
  dispersion: number
  /** Oberflächenrauheit 0..1 — 0 = punktförmiges Glanzlicht, 1 = breit verschmiert. */
  roughness: number
  /** Lichtrichtung als Azimut (rad, 0 = rechts, gegen den Uhrzeigersinn). */
  lightAzimuth: number
  /** Lichtrichtung als Höhenwinkel (rad, 0 = flach von der Seite, π/2 = senkrecht von oben). */
  lightElevation: number
  /** Stärke des Glanzlichts. */
  specular: number
  /** Stärke der Fresnel-Randaufhellung. */
  fresnel: number
  /** Stärke der Kaustik (Lichtfleck unter dem Tropfen). */
  caustic: number
  /** Eigenfarbe des Glases (linear 0..1). */
  tint: Vec3
  /** Wie stark die Eigenfarbe durchschlägt, 0..1. */
  tintStrength: number
  /** Stärke des Kontaktschattens unter dem Tropfen. */
  shadow: number
}

/**
 * Voreinstellungen. Absichtlich physikalisch benannt statt "Style A/B/C" —
 * wer den Baukasten später benutzt, soll wissen, WAS er einstellt.
 */
export const GLASS_PRESETS = {
  wassertropfen: {
    radius: 90, bulge: 0.82, profile: 0.5, ior: 1.333, depth: 46,
    dispersion: 0.022, roughness: 0.14, lightAzimuth: 2.36, lightElevation: 0.9,
    specular: 1, fresnel: 1, caustic: 0.85,
    tint: [0.92, 0.97, 1] as Vec3, tintStrength: 0.1, shadow: 0.5,
  },
  regentropfen: {
    radius: 70, bulge: 1, profile: 0.42, ior: 1.333, depth: 60,
    dispersion: 0.045, roughness: 0.10, lightAzimuth: 2.1, lightElevation: 1.1,
    specular: 1.25, fresnel: 1.15, caustic: 1.1,
    tint: [0.9, 0.96, 1] as Vec3, tintStrength: 0.08, shadow: 0.62,
  },
  glaslinse: {
    radius: 100, bulge: 0.6, profile: 0.62, ior: 1.52, depth: 40,
    dispersion: 0.06, roughness: 0.18, lightAzimuth: 2.36, lightElevation: 0.8,
    specular: 0.9, fresnel: 0.9, caustic: 0.55,
    tint: [0.95, 0.98, 1] as Vec3, tintStrength: 0.14, shadow: 0.42,
  },
  /** Zurückhaltend genug, dass Text darauf noch lesbar bleibt — der Kandidat für echte UI-Flächen. */
  appGlas: {
    radius: 120, bulge: 0.34, profile: 0.34, ior: 1.42, depth: 26,
    dispersion: 0.014, roughness: 0.22, lightAzimuth: 2.36, lightElevation: 0.95,
    specular: 0.6, fresnel: 0.7, caustic: 0.3,
    tint: [0.96, 0.98, 1] as Vec3, tintStrength: 0.18, shadow: 0.3,
  },
} satisfies Record<string, GlassParams>

export type GlassPresetName = keyof typeof GLASS_PRESETS

// --- Vektor-Kleinkram ------------------------------------------------------

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** Lichtrichtung als Einheitsvektor (zeigt von der Oberfläche ZUM Licht). */
export function lightVector(p: Pick<GlassParams, 'lightAzimuth' | 'lightElevation'>): Vec3 {
  const ce = Math.cos(p.lightElevation)
  return normalize3([Math.cos(p.lightAzimuth) * ce, Math.sin(p.lightAzimuth) * ce, Math.sin(p.lightElevation)])
}

// --- 1./2. Höhenfeld und Normale ------------------------------------------

/**
 * Höhe der Tropfenoberfläche über der Scheibe, bei normiertem Abstand u = r/R.
 *
 *   h(u) = bulge · R · (1 − u²)^p
 *
 * p = 0.5 ergibt exakt die Kugelkalotte. Kleinere p geben den flacheren
 * Deckel mit dem steil abfallenden Rand, den ein reales Tropfenprofil hat —
 * und genau dieser steile Rand ist es, der später den hellen Fresnel-Saum
 * erzeugt.
 */
export function dropletHeight(u: number, p: GlassParams): number {
  if (u >= 1) return 0
  return p.bulge * p.radius * Math.pow(1 - u * u, p.profile)
}

/**
 * Oberflächennormale an der Stelle (dx, dy) relativ zum Tropfenmittelpunkt.
 * Gibt null zurück, wenn der Punkt außerhalb liegt.
 *
 * Analytisch abgeleitet statt aus einer Bitmap gesampelt: dh/dr lässt sich
 * für dieses Profil geschlossen hinschreiben, also gibt es keinen Grund,
 * numerisch zu differenzieren und sich Treppenstufen einzufangen.
 *
 *   dh/dr = −2·bulge·p·u·(1 − u²)^(p−1)
 *   N     = normalize( −dh/dx, −dh/dy, 1 )
 */
export function dropletNormal(dx: number, dy: number, p: GlassParams): Vec3 | null {
  const r = Math.hypot(dx, dy)
  const u = r / p.radius
  if (u >= 1) return null
  if (r < 1e-6) return [0, 0, 1]
  // (1−u²)^(p−1) läuft am Rand gegen unendlich (p < 1) — das ist physikalisch
  // korrekt (die Oberfläche steht dort senkrecht), numerisch aber eine
  // Division durch ~0. Deckeln statt clampen des Radius: so bleibt der Rand
  // steil und der Fresnel-Saum erhalten, ohne NaN.
  const base = Math.max(1 - u * u, 1e-4)
  const slope = Math.min(2 * p.bulge * p.profile * u * Math.pow(base, p.profile - 1), 40)
  return normalize3([(slope * dx) / r, (slope * dy) / r, 1])
}

// --- 3. Brechung (Snellius) ------------------------------------------------

/**
 * Echtes refract() nach Snellius — dieselbe Formel wie in GLSL.
 * Gibt null bei Totalreflexion zurück (k < 0), was am Tropfenrand
 * tatsächlich passiert und dort korrekterweise zu Spiegelung statt
 * Durchsicht führt.
 */
export function refract(I: Vec3, N: Vec3, eta: number): Vec3 | null {
  const cosi = -dot3(N, I)
  const k = 1 - eta * eta * (1 - cosi * cosi)
  if (k < 0) return null
  const f = eta * cosi - Math.sqrt(k)
  return [eta * I[0] + f * N[0], eta * I[1] + f * N[1], eta * I[2] + f * N[2]]
}

/**
 * Wie weit der Hintergrund an dieser Stelle verschoben erscheint, in px.
 *
 * Der Blick geht senkrecht auf die Scheibe (I = 0,0,−1); der gebrochene
 * Strahl trifft die Hintergrundebene in `depth` px Tiefe. `iorScale`
 * verschiebt den Brechungsindex für die Dispersion (Rot/Grün/Blau).
 *
 * Der Versatz zeigt nach INNEN — deshalb wirkt der Tropfen als Lupe, und
 * deshalb sieht man am Rand den zusammengestauchten, teils umgeklappten
 * Hintergrund. Das fällt hier aus der Rechnung heraus, es ist nicht
 * hineingeschummelt.
 */
export function refractionOffset(N: Vec3, p: GlassParams, iorScale = 0): Vec2 {
  const eta = 1 / Math.max(1.0001, p.ior + iorScale)
  const T = refract([0, 0, -1], N, eta)
  if (!T) return [0, 0]
  const tz = Math.abs(T[2]) || 1e-4
  return [(T[0] / tz) * p.depth, (T[1] / tz) * p.depth]
}

// --- 4. Fresnel ------------------------------------------------------------

/** Reflexionsgrad bei senkrechtem Einfall — aus dem Brechungsindex, nicht geraten. */
export function fresnelF0(ior: number): number {
  const f = (1 - ior) / (1 + ior)
  return f * f
}

/** Schlick-Näherung. Am Tropfenrand (cosTheta → 0) geht sie gegen 1: der Rand wird zum Spiegel. */
export function fresnelSchlick(cosTheta: number, ior: number): number {
  const f0 = fresnelF0(ior)
  const m = Math.max(0, Math.min(1, 1 - cosTheta))
  return f0 + (1 - f0) * Math.pow(m, 5)
}

// --- 5. Glanzlicht ---------------------------------------------------------

/** Blinn-Phong-Exponent aus der Rauheit — die übliche Umrechnung, damit "roughness" linear regelbar bleibt. */
export function shininessFromRoughness(roughness: number): number {
  const a = Math.max(0.02, roughness) ** 2
  return 2 / (a * a) - 2
}

export function specularTerm(N: Vec3, L: Vec3, roughness: number): number {
  const H = normalize3([L[0], L[1], L[2] + 1]) // V = (0,0,1)
  const nh = Math.max(0, dot3(N, H))
  return Math.pow(nh, shininessFromRoughness(roughness))
}

// --- 6. Kaustik ------------------------------------------------------------

/**
 * Wo die Tropfenlinse das Licht darunter bündelt: gegenüber der Lichtquelle,
 * um so weiter außen, je flacher das Licht einfällt. Eine Näherung — eine
 * echte Kaustik bräuchte Photon-Mapping —, aber sie sitzt an der richtigen
 * Stelle und wandert korrekt mit, wenn das Licht sich bewegt.
 */
export function causticCenter(L: Vec3, p: GlassParams): Vec2 {
  const spread = p.radius * 0.42 * (1 - L[2])
  return [-L[0] * spread, -L[1] * spread]
}

// --- Verallgemeinerung auf beliebige Formen --------------------------------

/**
 * Dieselbe Normale wie dropletNormal(), aber für beliebige Formen.
 *
 * Statt "Abstand vom Kreismittelpunkt" nimmt sie den Abstand von der KANTE
 * (aus einem Signed-Distance-Feld) und die Richtung aus dessen Gradienten.
 * Für einen Kreis mit rimWidth = radius kommt exakt dasselbe heraus — für ein
 * abgerundetes Rechteck bekommt man eine flache Mitte mit angeschrägter
 * Kante, und genau das braucht eine UI-Fläche, auf der noch Text stehen soll.
 *
 * @param edgeDist Abstand zur Kante, positiv INNERHALB der Form, in px.
 * @param rimWidth Wie weit die Wölbung von der Kante nach innen reicht, in px.
 * @param gx,gy    Nach außen zeigender Einheitsgradient des Distanzfeldes.
 */
export function surfaceNormalFromEdge(
  edgeDist: number, rimWidth: number, gx: number, gy: number, p: GlassParams,
): Vec3 | null {
  if (edgeDist <= 0) return null
  const u = Math.min(0.9999, Math.max(0, 1 - edgeDist / Math.max(1, rimWidth)))
  const base = Math.max(1 - u * u, 1e-4)
  const slope = Math.min(2 * p.bulge * p.profile * u * Math.pow(base, p.profile - 1), 40)
  return normalize3([slope * gx, slope * gy, 1])
}

/** Höhe über der Scheibe für eine beliebige Form — Gegenstück zu dropletHeight(). */
export function heightFromEdge(edgeDist: number, rimWidth: number, p: GlassParams): number {
  if (edgeDist <= 0) return 0
  const u = Math.min(1, Math.max(0, 1 - edgeDist / Math.max(1, rimWidth)))
  return p.bulge * rimWidth * Math.pow(Math.max(1 - u * u, 0), p.profile)
}

/** Signed Distance zu einem abgerundeten Rechteck. Negativ innen. Deckt mit cornerRadius = w/2 = h/2 auch den Kreis ab. */
export function sdRoundBox(px: number, py: number, halfW: number, halfH: number, r: number): number {
  const rr = Math.min(r, Math.min(halfW, halfH))
  const qx = Math.abs(px) - halfW + rr
  const qy = Math.abs(py) - halfH + rr
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return Math.min(Math.max(qx, qy), 0) + outside - rr
}
