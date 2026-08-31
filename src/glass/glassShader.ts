/**
 * Die GLSL-Fassung des Physik-Kerns aus glassPhysics.ts.
 *
 * Bewusst eine Eins-zu-eins-Übersetzung: gleiche Formeln, gleiche
 * Parameternamen, gleiche Konstanten. Wenn die WebGL-Stufe anders aussieht
 * als die anderen beiden, liegt das dann an der Technik (Auflösung der
 * Brechung, Pro-Pixel statt vorberechnet) und nicht daran, dass hier heimlich
 * etwas anderes gerechnet wird.
 *
 * Verallgemeinert gegenüber der TS-Fassung ist nur die FORM: statt nur
 * Kreisen versteht der Shader beliebige Signed-Distance-Felder, also auch
 * abgerundete Rechtecke. Damit gilt dieselbe Optik für einen Wassertropfen
 * UND für eine Bedienleisten-Pille oder eine Karte — was der eigentliche
 * Punkt des Baukastens ist.
 */

export const GLASS_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/**
 * Der geteilte Kopf: Praeambel, Ein-/Ausgaben und alle Uniforms, die JEDE
 * Fassung braucht. Fassungsspezifische Uniforms haengt der Aufrufer direkt
 * dahinter an, vor GLASS_GLSL_CORE.
 */
export const GLASS_GLSL_HEAD = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uLight;

uniform float uBulge;
uniform float uProfile;
uniform float uIor;
uniform float uDepth;
uniform float uDispersion;
uniform float uRoughness;
uniform float uSpecular;
uniform float uFresnel;
uniform float uCaustic;
uniform vec3  uTint;
uniform float uTintStrength;
uniform float uShadow;

#define MAX_SHAPES 12
uniform int   uShapeCount;
uniform vec4  uShapes[MAX_SHAPES];
uniform vec2  uShapeExtra[MAX_SHAPES];
uniform float uMerge;

`

/**
 * Der geteilte Physik-Kern in GLSL: Distanzfelder, Normale aus dem
 * Hoehenfeld, Snellius, Fresnel, Glanzlicht-Exponent, Umgebungsspiegelung.
 *
 * Genau das, was glassPhysics.ts in TypeScript enthaelt — herausgeloest,
 * damit die Laborfassung und die App-Fassung ihn TEILEN statt ihn zu
 * kopieren. Zwei Kopien derselben Formeln laufen frueher oder spaeter
 * auseinander, und dann vergleicht man nichts mehr.
 *
 * Setzt GLASS_GLSL_HEAD davor voraus. Ruft selbst kein scene() auf — das
 * definiert jede Fassung fuer sich, direkt vor ihrem main().
 */
export const GLASS_GLSL_CORE = /* glsl */ `// ---------------------------------------------------------------------------
// Formen (SDF)
// ---------------------------------------------------------------------------

float sdCircle(vec2 p, vec2 c, float r) { return length(p - c) - r; }

float sdRoundBox(vec2 p, vec2 c, vec2 halfSize, float r) {
  vec2 q = abs(p - c) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float shapeDist(vec2 p, int i) {
  vec4 s = uShapes[i];
  if (s.w < 0.0) return sdCircle(p, s.xy, s.z);
  return sdRoundBox(p, s.xy, vec2(s.z, s.w), uShapeExtra[i].y);
}

float smoothMin(float a, float b, float k) {
  if (k <= 0.0001) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/**
 * Abstandsfeld aller Formen zusammen.
 *
 * rimWidth wird STETIG gemischt statt von der jeweils naechsten Form
 * uebernommen. Die harte Variante ("nimm die Randbreite der naechsten Form")
 * springt genau auf den Mittellinien zwischen zwei verschieden grossen
 * Formen — was als scharfe keilfoermige Kanten im Schatten sichtbar wurde.
 * Die exponentielle Gewichtung nach Abstand hat diese Sprungstellen nicht.
 */
float sceneDist(vec2 p, out float rimWidth) {
  float d = 1e9;
  float wsum = 0.0;
  float rsum = 0.0;
  float k = uMerge * 60.0;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uShapeCount) break;
    float di = shapeDist(p, i);
    float w = exp(-max(di, 0.0) / 90.0);
    wsum += w;
    rsum += w * uShapeExtra[i].x;
    d = smoothMin(d, di, k);
  }
  rimWidth = wsum > 1e-5 ? rsum / wsum : 40.0;
  return d;
}

// ---------------------------------------------------------------------------
// Physik-Kern — identisch zu glassPhysics.ts
// ---------------------------------------------------------------------------

vec3 surfaceNormal(vec2 p, float d, float rimWidth) {
  float e = 1.0;
  float rw;
  vec2 g = vec2(
    sceneDist(p + vec2(e, 0.0), rw) - sceneDist(p - vec2(e, 0.0), rw),
    sceneDist(p + vec2(0.0, e), rw) - sceneDist(p - vec2(0.0, e), rw)
  );
  // Kein "+1e-6" auf den Vektor: in der Mitte einer Form ist der Gradient
  // null, und normalize(vec2(1e-6)) zeigt diagonal — das gab einen sichtbaren
  // Streifen quer durch jeden Tropfen. Stattdessen sauber abfangen.
  float gl = length(g);
  vec2 grad = gl > 1e-5 ? g / gl : vec2(0.0);

  float u = clamp(1.0 + d / max(rimWidth, 1.0), 0.0, 0.9999);
  float base = max(1.0 - u * u, 1e-4);
  float slope = min(2.0 * uBulge * uProfile * u * pow(base, uProfile - 1.0), 40.0);
  return normalize(vec3(slope * grad, 1.0));
}

float fresnelF0(float ior) { float f = (1.0 - ior) / (1.0 + ior); return f * f; }

float fresnelSchlick(float cosTheta, float ior) {
  float f0 = fresnelF0(ior);
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

/**
 * Blinn-Phong-Exponent aus der Rauheit — nach oben gedeckelt.
 *
 * Die reine Formel 2/alpha^2 - 2 liefert bei Rauheit 0.06 rund 154 000. Das
 * ist fuer eine ideale Spiegelflaeche richtig, aber ein Glanzfleck dieser
 * Groesse ist kleiner als ein Pixel und damit unsichtbar. Physikalisch
 * gesehen ist die Deckelung nichts anderes als die Aussage, dass die
 * Lichtquelle eine endliche Ausdehnung hat — eine Lampe, kein Punkt.
 */
float shininessFromRoughness(float r) {
  float a = max(0.05, r); a = a * a;
  return clamp(2.0 / (a * a) - 2.0, 8.0, 900.0);
}

vec2 refractionOffset(vec3 N, float iorShift) {
  float eta = 1.0 / max(1.0001, uIor + iorShift);
  vec3 T = refract(vec3(0.0, 0.0, -1.0), N, eta);
  if (dot(T, T) < 1e-8) return vec2(0.0);
  return (T.xy / max(abs(T.z), 1e-4)) * uDepth;
}

/**
 * Was der Tropfen spiegelt. Ein Glaskoerper wird erst dadurch als Glas
 * lesbar, dass er eine VERAENDERLICHE Umgebung spiegelt — eine flache weisse
 * Flaeche zu spiegeln sieht aus wie mattes Plastik. Deshalb hier ein
 * Himmelsverlauf plus die Lampe selbst, abgetastet ueber den echten
 * Reflexionsvektor.
 */
vec3 skyColor(vec3 dir, vec3 L) {
  float up = clamp(dir.z * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.55, 0.68, 0.88), vec3(1.0, 1.0, 1.0), up * up);
  float sun = pow(max(dot(dir, L), 0.0), 60.0);
  return sky + vec3(1.0, 0.99, 0.96) * sun * 1.6;
}

`

/** Die Laborfassung: drei Testmotive, sonst identisch zur App-Fassung. */
export const GLASS_FRAG = GLASS_GLSL_HEAD + /* glsl */ `
uniform int uSceneMode;
` + GLASS_GLSL_CORE + /* glsl */ `// ---------------------------------------------------------------------------
// Hintergrund — prozedural, damit die Brechung exakt definiert ist.
// ---------------------------------------------------------------------------

float ringBand(vec2 p, vec2 c, float r, float w) {
  return smoothstep(w, 0.0, abs(length(p - c) - r));
}

vec3 scene(vec2 px) {
  vec2 uv = px / uResolution;

  if (uSceneMode == 1) {
    vec3 base = mix(vec3(0.09, 0.36, 0.78), vec3(0.97, 0.98, 1.0), uv.y);
    vec2 g = abs(fract(px / 44.0) - 0.5);
    float line = smoothstep(0.46, 0.5, max(g.x, g.y));
    vec2 g2 = abs(fract(px / 220.0) - 0.5);
    float major = smoothstep(0.47, 0.5, max(g2.x, g2.y));
    return mix(base, vec3(1.0), line * 0.55 + major * 0.35);
  }

  if (uSceneMode == 2) {
    vec3 c = vec3(0.97, 0.98, 1.0);
    c = mix(c, vec3(0.12, 0.56, 1.00), smoothstep(0.55, 0.0, length(uv - vec2(0.25, 0.25))));
    c = mix(c, vec3(1.00, 0.58, 0.00), smoothstep(0.42, 0.0, length(uv - vec2(0.80, 0.30))));
    c = mix(c, vec3(0.20, 0.78, 0.35), smoothstep(0.45, 0.0, length(uv - vec2(0.30, 0.82))));
    c = mix(c, vec3(0.69, 0.32, 0.87), smoothstep(0.40, 0.0, length(uv - vec2(0.78, 0.78))));
    return c;
  }

  vec3 c = mix(vec3(0.42, 0.66, 0.96), vec3(0.949, 0.949, 0.968), smoothstep(0.0, 0.62, uv.y));
  vec2 rc = uResolution * vec2(0.82, 0.86);
  float s = uResolution.x;
  c = mix(c, vec3(0.12, 0.56, 1.00), ringBand(px, rc, s * 0.30, s * 0.11) * 0.20);
  c = mix(c, vec3(1.00, 0.22, 0.37), ringBand(px, rc, s * 0.23, s * 0.09) * 0.18);
  c = mix(c, vec3(0.20, 0.78, 0.35), ringBand(px, rc, s * 0.16, s * 0.08) * 0.17);
  c = mix(c, vec3(1.00, 0.80, 0.00), ringBand(px, rc, s * 0.09, s * 0.07) * 0.16);
  return c;
}

void main() {
  vec2 px = vUv * uResolution;
  px.y = uResolution.y - px.y;

  float rimWidth;
  float d = sceneDist(px, rimWidth);

  vec3 L = normalize(uLight);
  vec3 col = scene(px);

  // --- Auf der Scheibe: Kontaktschatten und Kaustik ------------------------
  // Beides sitzt am selben Ort, hinter dem Tropfen vom Licht aus gesehen.
  // Genau so sehen echte Tropfen aus: ein weicher dunkler Hof mit einem
  // hellen Kern darin, weil die Tropfenlinse das Licht dorthin buendelt.
  if (d > 0.0) {
    float dummy;
    // Der Schattenversatz ist Hoehe / tan(Hoehenwinkel). Da L ein
    // Einheitsvektor ist, IST L.xy/L.z bereits genau dieser Kotangens —
    // deshalb hier kein zusaetzlicher Faktor. (Vorher stand hier eine
    // Division durch L.z mal 1.7, was den Schatten auf ein Vielfaches der
    // physikalisch richtigen Entfernung geworfen hat.)
    float dropHeight = uBulge * rimWidth * 0.85;
    vec2  lightOffset = (L.xy / max(L.z, 0.25)) * dropHeight;
    float dProj = sceneDist(px + lightOffset, dummy);

    float occl = smoothstep(rimWidth * 0.55, -rimWidth * 0.25, dProj);
    col *= 1.0 - occl * uShadow * 0.45;

    // Die Kaustik ist ein FOKUSSIERTER Fleck, deutlich kleiner als der
    // Tropfen selbst — deshalb setzt die Rampe erst tief im projizierten
    // Fussabdruck ein. Und sie skaliert mit der Woelbung: eine flache
    // Pfuetze buendelt nichts.
    float core = smoothstep(-rimWidth * 0.35, -rimWidth * 0.88, dProj);
    col += vec3(0.92, 0.96, 1.0) * core * uCaustic * uBulge * 0.30;

    // Haarfeine Verdunkelung an der Kontaktlinie — Umgebungsverdeckung,
    // kein Schattenwurf, deshalb unabhaengig vom Licht.
    col *= 1.0 - smoothstep(rimWidth * 0.16, 0.0, d) * 0.10;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    return;
  }

  vec3 N = surfaceNormal(px, d, rimWidth);

  // --- Brechung mit Dispersion: R, G und B getrennt abtasten ---------------
  vec2 oR = refractionOffset(N, -uDispersion);
  vec2 oG = refractionOffset(N,  0.0);
  vec2 oB = refractionOffset(N, +uDispersion);
  vec3 refr = vec3(scene(px + oR).r, scene(px + oG).g, scene(px + oB).b);

  // --- Fresnel: der Rand wird zum Spiegel ---------------------------------
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  vec3 env = skyColor(R, L);
  float F = clamp(fresnelSchlick(N.z, uIor) * uFresnel, 0.0, 1.0);

  vec3 body = mix(refr, env, F);
  body = mix(body, body * uTint, uTintStrength);

  // --- Glanzlicht ----------------------------------------------------------
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);
  body += vec3(1.0) * pow(nh, shininessFromRoughness(uRoughness)) * uSpecular;
  // Breites Umfeldlicht — ohne das wirkt die Oberflaeche wie Plastik.
  body += vec3(0.95, 0.97, 1.0) * pow(nh, 5.0) * 0.14 * uSpecular;

  // Duennes dunkles Band ganz innen am Rand, wo der Blick streift und kaum
  // noch etwas durchkommt. Das ist es, was die Dicke verkauft.
  body *= 1.0 - smoothstep(0.5, 0.0, N.z) * 0.22;

  fragColor = vec4(clamp(body, 0.0, 1.0), 1.0);
}
`
