import { GLASS_GLSL_CORE, GLASS_GLSL_HEAD } from './glassShader'

/**
 * Die App-Fassung des Glas-Shaders.
 *
 * Teilt sich den Physik-Kern (GLASS_GLSL_CORE) mit der Laborfassung — der
 * einzige Unterschied ist scene(): statt der drei Testmotive zeichnet sie
 * hier den ECHTEN Hintergrund von Tracke nach.
 *
 * Diese Nachbildung ist der Angelpunkt des ganzen Prototyps. WebGL kann nur
 * brechen, was es selbst gezeichnet hat — also muss alles, was hinter einer
 * Glasfläche liegen soll, hier drin sein:
 *
 *   1. --color-bg als Grundfläche          (body in index.css)
 *   2. die Nährwertringe unten rechts      (BackgroundRings.tsx)
 *   3. der Farbverlauf am oberen Rand      (TopGradient.tsx, inzwischen ersetzt
 *      durch AmbientBackground.tsx — siehe die Anmerkung bei scene() unten)
 *
 * Alles davon kommt als Uniform herein statt als Konstante, weil es sich zur
 * Laufzeit ändert: --color-section wechselt mit der Route, --color-bg mit
 * dem Dunkelmodus. Würde man das hier festverdrahten, liefe die WebGL-Ebene
 * bei jedem Seitenwechsel gegen das CSS auseinander.
 *
 * Was diese Ebene NICHT kann und auch nicht können wird: den gescrollten
 * Inhalt brechen. Mahlzeitenkarten, Text, Diagramme sind DOM und für einen
 * Shader unerreichbar. Deshalb bleibt die Bedienleiste in diesem Prototyp
 * bewusst auf CSS — siehe GlassStage.tsx.
 */
export const APP_GLASS_FRAG = GLASS_GLSL_HEAD + /* glsl */ `
uniform vec3  uBgColor;        // --color-bg
uniform vec3  uSectionColor;   // --color-section (wechselt mit der Route)
uniform float uGradientHeight; // Höhe von .top-gradient in px
uniform float uGradientPeak;   // wo der Verlauf am kräftigsten ist, 0..1
uniform float uGradientAlpha;  // Spitzenintensität (CSS: 60 %)
uniform vec2  uRingCenter;
uniform float uRingRadius;
uniform float uRingAlpha;
uniform vec3  uRingColors[4];  // kcal, Protein, Carbs, Fett
uniform vec3  uVeilColor;      // --color-surface
uniform float uVeilAlpha;      // Deckkraft des Schleiers, spiegelt .glass-subtle
` + GLASS_GLSL_CORE + /* glsl */ `

vec3 scene(vec2 px) {
  vec3 c = uBgColor;

  // --- Nährwertringe (BackgroundRings) --------------------------------------
  // Im Original sind das vier gezeichnete Ringe mit Verlaufs-Sweep, danach
  // 22 px weichgezeichnet und auf 48 % Deckkraft gesetzt. Was davon übrig
  // bleibt, sind vier weiche farbige Bänder — genau die werden hier direkt
  // gezeichnet, statt erst zu zeichnen und dann zu verwischen. Das spart den
  // Weichzeichner und trifft das Ergebnis.
  // Radien und Bandbreite sind aus dem Original ausgerechnet, nicht geschaetzt:
  // ConcentricRings zeichnet in einem 128er-Viewport Ringe bei r = 57.5, 41.5,
  // 25.5, 9.5 mit Strichstaerke 13, skaliert auf 22 rem (Faktor 2.75). Als
  // Anteil des aeusseren Rings sind das 1 / 0.72 / 0.44 / 0.17. Die Bandbreite
  // ist Strichstaerke plus die 22 px Weichzeichnung.
  float bandW = uRingRadius * 0.28;
  for (int i = 0; i < 4; i++) {
    float r = uRingRadius * (1.0 - float(i) * 0.278);
    float e = smoothstep(bandW, 0.0, abs(length(px - uRingCenter) - r));
    // Quadriert: ein Gauss-Weichzeichner faellt weicher ab als eine
    // smoothstep-Rampe, sonst stehen die Baender zu hart im Bild.
    c = mix(c, uRingColors[i], e * e * uRingAlpha);
  }

  // --- Farbverlauf am oberen Rand (TopGradient, veraltet) -------------------
  // Big-Number-Redesign: TopGradient.tsx/.top-gradient existieren nicht mehr,
  // ersetzt durch AmbientBackground.tsx (drei große, weichgezeichnete Kreise
  // über den ganzen Viewport statt eines Verlaufs im oberen Viertel). Dieser
  // Block hier bildet also nicht mehr nach, was tatsächlich hinter der
  // Glasfläche liegt — unschädlich nur, weil GlassStage in App.tsx mit
  // enabled={false} läuft und dieser Shader-Pfad aktuell nirgends zeichnet.
  // Vor einer Reaktivierung müsste scene() erst auf AmbientBackground
  // umgestellt werden, sonst zeigt die WebGL-Fläche einen Hintergrund, der
  // nicht mehr existiert.
  // CSS (alt): linear-gradient(to bottom, transparent, <section> <peak>, transparent)
  // Also zwei lineare Rampen, keine Glättung — bewusst genau so nachgebaut,
  // damit die Kante zwischen WebGL-Fläche und CSS-Bereichen nicht sichtbar wird.
  float t = px.y / max(uGradientHeight, 1.0);
  if (t < 1.0) {
    float g = t < uGradientPeak
      ? t / max(uGradientPeak, 1e-3)
      : (1.0 - t) / max(1.0 - uGradientPeak, 1e-3);
    c = mix(c, uSectionColor, clamp(g, 0.0, 1.0) * uGradientAlpha);
  }

  return c;
}

void main() {
  vec2 px = vUv * uResolution;
  px.y = uResolution.y - px.y;

  float rimWidth;
  float d = sceneDist(px, rimWidth);

  vec3 L = normalize(uLight);
  vec3 col = scene(px);

  if (d > 0.0) {
    // Außerhalb jeder Glasfläche: nur der Hintergrund plus der Schatten, den
    // die Flächen darauf werfen. Keine Kaustik — bei einer Bedienfläche wäre
    // ein gebündelter Lichtfleck daneben reine Behauptung, kein Realismus.
    float dummy;
    float dropHeight = uBulge * rimWidth * 0.85;
    float dProj = sceneDist(px + (L.xy / max(L.z, 0.25)) * dropHeight, dummy);
    col *= 1.0 - smoothstep(rimWidth * 0.55, -rimWidth * 0.25, dProj) * uShadow * 0.30;
    col *= 1.0 - smoothstep(rimWidth * 0.16, 0.0, d) * 0.07;
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    return;
  }

  vec3 N = surfaceNormal(px, d, rimWidth);

  vec2 oR = refractionOffset(N, -uDispersion);
  vec2 oG = refractionOffset(N,  0.0);
  vec2 oB = refractionOffset(N, +uDispersion);
  vec3 body = vec3(scene(px + oR).r, scene(px + oG).g, scene(px + oB).b);

  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float F = clamp(fresnelSchlick(N.z, uIor) * uFresnel, 0.0, 1.0);
  body = mix(body, skyColor(R, L), F);
  body = mix(body, body * uTint, uTintStrength);

  // Der weisse Schleier aus .glass-subtle (rgba(255,255,255,.55), im
  // Dunkelmodus rgba(28,28,30,.55)). Der ist keine Kosmetik: er ist der
  // Grund, warum Text auf diesen Flaechen lesbar bleibt. Ohne ihn wird aus
  // der Karte durchsichtiges Glas — optisch reizvoll, als Untergrund fuer
  // eine Mahlzeitenliste unbrauchbar.
  body = mix(body, uVeilColor, uVeilAlpha);

  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);

  // Das Glanzlicht ist hier gedeckelt, anders als im Labor. Auf diesen Flächen
  // steht Text — und ein wanderndes Glanzlicht macht aus dem Kontrast eine
  // bewegliche Größe. Die Deckelung hält den hellsten Punkt so weit unten,
  // dass der Text darüber sein Kontrastverhältnis behält, egal wo das Licht
  // gerade steht.
  float spec = pow(nh, shininessFromRoughness(uRoughness)) * uSpecular;
  body += vec3(1.0) * min(spec, 0.34);
  body += vec3(0.95, 0.97, 1.0) * pow(nh, 5.0) * 0.10 * uSpecular;

  body *= 1.0 - smoothstep(0.5, 0.0, N.z) * 0.18;

  fragColor = vec4(clamp(body, 0.0, 1.0), 1.0);
}
`
