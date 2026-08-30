import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { GLASS_PRESETS, type GlassParams, type GlassPresetName } from '../glass/glassPhysics'
import { droplet, panel, sceneBackground, SCENE_HINTS, SCENE_LABELS, type GlassShape, type SceneMode } from './labScene'
import { useLightSource } from '../glass/useLightSource'
import { GlassCSS } from './GlassCSS'
import { GlassSVG } from './GlassSVG'
import { GlassWebGL } from './GlassWebGL'

/**
 * Der Glas-Baukasten als Vergleichsseite.
 *
 * Bewusst KEIN Bestandteil der App: die Route liegt unter /lab, taucht in
 * keiner Navigation auf und wird lazy geladen, landet also nicht einmal im
 * Haupt-Bundle. Hier wird ausprobiert, nicht ausgeliefert.
 *
 * Alle drei Stufen liegen untereinander, teilen dieselben Parameter, dasselbe
 * Motiv und dieselbe Lichtquelle. Nur so vergleicht man tatsaechlich die
 * Render-Technik und nicht drei verschieden eingestellte Effekte.
 */

type ShapeSet = 'drops' | 'ui' | 'mixed'

const SHAPE_SET_LABELS: Record<ShapeSet, string> = {
  drops: 'Tropfen',
  ui: 'App-Bausteine',
  mixed: 'Gemischt',
}

const PRESET_LABELS: Record<GlassPresetName, string> = {
  wassertropfen: 'Wassertropfen',
  regentropfen: 'Regentropfen',
  glaslinse: 'Glaslinse',
  appGlas: 'App-Glas',
}

function buildShapes(set: ShapeSet, w: number, h: number, scale: number): GlassShape[] {
  const s = (v: number) => v * scale
  if (set === 'ui') {
    return [
      panel('card', w * 0.5, h * 0.3, w * 0.84, h * 0.34, 28, 26, 'Karte'),
      panel('tileA', w * 0.26, h * 0.62, w * 0.36, h * 0.18, 22, 20, 'Kachel'),
      panel('tileB', w * 0.68, h * 0.62, w * 0.36, h * 0.18, 22, 20, 'Kachel'),
      panel('nav', w * 0.5, h * 0.86, w * 0.62, 60, 30, 24, 'Bedienleiste'),
    ]
  }
  if (set === 'mixed') {
    return [
      panel('card', w * 0.5, h * 0.28, w * 0.84, h * 0.3, 28, 26, 'Karte'),
      droplet('d1', w * 0.24, h * 0.62, s(46)),
      droplet('d2', w * 0.42, h * 0.68, s(26)),
      droplet('d3', w * 0.76, h * 0.58, s(34)),
      panel('nav', w * 0.5, h * 0.88, w * 0.62, 58, 29, 24, 'Bedienleiste'),
    ]
  }
  return [
    droplet('d1', w * 0.3, h * 0.36, s(62)),
    droplet('d2', w * 0.68, h * 0.28, s(38)),
    // Die beiden hier stehen absichtlich dicht beieinander — an ihnen sieht
    // man, was die Verschmelzung macht (nur Stufe 3 kann das).
    droplet('d3', w * 0.62, h * 0.66, s(34)),
    droplet('d4', w * 0.78, h * 0.72, s(24)),
    droplet('d5', w * 0.22, h * 0.75, s(18)),
    droplet('d6', w * 0.44, h * 0.84, s(12)),
  ]
}

function Slider({
  label, value, min, max, step, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="font-mono text-[11px] text-ink-soft">{value.toFixed(step < 0.01 ? 3 : 2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-[var(--color-accent)]"
      />
      {hint && <span className="text-[10px] leading-snug text-ink-faint">{hint}</span>}
    </label>
  )
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="glass flex gap-1 rounded-full p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
            value === o.key ? 'bg-accent/20 text-ink' : 'text-ink-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function StageFrame({
  tier, note, children, onMeasure,
}: {
  tier: string; note: string; children: React.ReactNode
  onMeasure?: (w: number, h: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !onMeasure) return
    const ro = new ResizeObserver(() => onMeasure(el.clientWidth, el.clientHeight))
    ro.observe(el)
    onMeasure(el.clientWidth, el.clientHeight)
    return () => ro.disconnect()
  }, [onMeasure])

  return (
    <section className="mb-5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{tier}</h2>
      </div>
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-3xl shadow-sm shadow-black/10"
        style={{ aspectRatio: '4 / 3' }}
      >
        {children}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{note}</p>
    </section>
  )
}

export function GlassLab() {
  const [presetName, setPresetName] = useState<GlassPresetName>('wassertropfen')
  const [params, setParams] = useState<GlassParams>({ ...GLASS_PRESETS.wassertropfen })
  const [scene, setScene] = useState<SceneMode>('grid')
  const [shapeSet, setShapeSet] = useState<ShapeSet>('drops')
  const [merge, setMerge] = useState(0.35)
  const [sizeScale, setSizeScale] = useState(1)
  const [glError, setGlError] = useState<string | null>(null)
  const [stage, setStage] = useState({ w: 360, h: 270 })

  const { setContainer, lightRef, gyro, enableGyro } = useLightSource()

  const shapes = useMemo(
    () => buildShapes(shapeSet, stage.w, stage.h, sizeScale),
    [shapeSet, stage.w, stage.h, sizeScale],
  )

  // Die SVG-Stufe muss bei jeder Parameteraenderung ihre Versatzkarten neu
  // auf einem Canvas ausrechnen. Waehrend man an einem Regler zieht, waere
  // das pro Frame — deshalb bekommt nur sie die verzoegerten Werte. Die
  // anderen beiden Stufen reagieren sofort, was den Unterschied nebenbei
  // sichtbar macht.
  const deferredParams = useDeferredValue(params)
  const deferredShapes = useDeferredValue(shapes)

  const set = <K extends keyof GlassParams>(k: K, v: GlassParams[K]) => setParams((p) => ({ ...p, [k]: v }))

  const applyPreset = (name: GlassPresetName) => {
    setPresetName(name)
    setParams({ ...GLASS_PRESETS[name] })
  }

  const bg = sceneBackground(scene)
  const onMeasure = useMemo(
    () => (w: number, h: number) => setStage((s) => (s.w === w && s.h === h ? s : { w, h })),
    [],
  )

  return (
    <div
      ref={setContainer}
      className="mx-auto max-w-lg px-4 pb-24 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
    >
      <h1 className="text-2xl font-bold text-ink">Glas-Baukasten</h1>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Dieselbe Physik, drei Render-Techniken. Bewege den Finger über die Seite — die Lichtquelle folgt ihm.
        {gyro === 'granted'
          ? ' Neigung ist aktiv und hat Vorrang.'
          : gyro === 'unsupported'
            ? ' Gerätneigung ist auf diesem Gerät nicht verfügbar.'
            : ''}
      </p>

      {gyro !== 'granted' && gyro !== 'unsupported' && (
        <button
          type="button"
          onClick={enableGyro}
          className="glass-accent mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          Gerätneigung als Lichtquelle nutzen
        </button>
      )}
      {gyro === 'denied' && (
        <p className="mt-2 text-[11px] text-danger">Zugriff auf die Neigungssensoren abgelehnt — der Zeiger steuert weiter das Licht.</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Segmented
          value={presetName}
          onChange={applyPreset}
          options={(Object.keys(GLASS_PRESETS) as GlassPresetName[]).map((k) => ({ key: k, label: PRESET_LABELS[k] }))}
        />
        <Segmented
          value={scene}
          onChange={setScene}
          options={(Object.keys(SCENE_LABELS) as SceneMode[]).map((k) => ({ key: k, label: SCENE_LABELS[k] }))}
        />
        <p className="px-1 text-[10px] text-ink-faint">{SCENE_HINTS[scene]}</p>
        <Segmented
          value={shapeSet}
          onChange={setShapeSet}
          options={(Object.keys(SHAPE_SET_LABELS) as ShapeSet[]).map((k) => ({ key: k, label: SHAPE_SET_LABELS[k] }))}
        />
      </div>

      <div className="mt-6">
        <StageFrame
          tier="1 · Nur CSS"
          note="Weichzeichnung plus gemalte Lichter. Keine Brechung — der Hintergrund wird nie verschoben, nur verwaschen. Deshalb wirkt es bei kleinen Flächen überzeugend und bei großen wie Milchglas."
          onMeasure={onMeasure}
        >
          <div className="absolute inset-0" style={{ background: bg, backgroundSize: `${stage.w}px ${stage.h}px` }} />
          {shapes.map((s) => (
            <GlassCSS key={s.id} shape={s} params={params} />
          ))}
        </StageFrame>

        <StageFrame
          tier="2 · SVG-Filter"
          note="Echte Brechung über feDisplacementMap aus einer vorberechneten Versatzkarte, plus 3-D-Glanzlicht über feSpecularLighting. Läuft auf iOS, weil der Hintergrund kopiert statt per backdrop-filter gelesen wird. Ohne Dispersion und ohne Kaustik."
        >
          <div className="absolute inset-0" style={{ background: bg, backgroundSize: `${stage.w}px ${stage.h}px` }} />
          {deferredShapes.map((s) => (
            <GlassSVG
              key={s.id}
              shape={s}
              params={deferredParams}
              scene={scene}
              stage={stage}
              lightRef={lightRef}
            />
          ))}
        </StageFrame>

        <StageFrame
          tier="3 · WebGL"
          note="Snellius pro Pixel, getrennt für Rot, Grün und Blau (Farbsäume), plus Fresnel, Kaustik, Kontaktschatten und Verschmelzen benachbarter Tropfen. Braucht den Hintergrund als bekannte Größe — hier im Shader nachgebaut."
        >
          {glError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface p-6 text-center text-xs text-ink-soft">
              {glError}
            </div>
          ) : (
            <GlassWebGL
              shapes={shapes}
              params={params}
              scene={scene}
              merge={merge}
              lightRef={lightRef}
              onError={setGlError}
            />
          )}
        </StageFrame>
      </div>

      <section className="glass-subtle glass-subtle-themed rounded-3xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Material</h2>
        <div className="flex flex-col gap-3">
          <Slider label="Wölbung" value={params.bulge} min={0} max={1} step={0.01} onChange={(v) => set('bulge', v)}
            hint="Wie hoch der Tropfen über der Fläche steht. 0 = flache Pfütze." />
          <Slider label="Randsteilheit" value={params.profile} min={0.3} max={1} step={0.01} onChange={(v) => set('profile', v)}
            hint="0.5 = exakte Kugelkalotte. Kleiner = flacher Deckel mit steilerem Rand." />
          <Slider label="Brechungsindex" value={params.ior} min={1} max={2.2} step={0.005} onChange={(v) => set('ior', v)}
            hint="Wasser 1.333 · Glas 1.52 · Diamant 2.42" />
          <Slider label="Tiefe" value={params.depth} min={0} max={120} step={1} onChange={(v) => set('depth', v)}
            hint="Abstand zum Hintergrund — der Hebel, an dem die Brechung ansetzt." />
          <Slider label="Dispersion" value={params.dispersion} min={0} max={0.14} step={0.002} onChange={(v) => set('dispersion', v)}
            hint="Farbsäume. Nur Stufe 3." />
          <Slider label="Rauheit" value={params.roughness} min={0.02} max={0.6} step={0.01} onChange={(v) => set('roughness', v)} />
        </div>

        <h2 className="mb-3 mt-5 text-sm font-semibold text-ink">Licht</h2>
        <div className="flex flex-col gap-3">
          <Slider label="Glanzlicht" value={params.specular} min={0} max={2} step={0.02} onChange={(v) => set('specular', v)} />
          <Slider label="Fresnel (Rand)" value={params.fresnel} min={0} max={2} step={0.02} onChange={(v) => set('fresnel', v)} />
          <Slider label="Kaustik" value={params.caustic} min={0} max={2} step={0.02} onChange={(v) => set('caustic', v)}
            hint="Der Lichtfleck, den die Tropfenlinse daneben wirft. Nur Stufe 3." />
          <Slider label="Kontaktschatten" value={params.shadow} min={0} max={1.5} step={0.02} onChange={(v) => set('shadow', v)} />
          <Slider label="Eigenfarbe" value={params.tintStrength} min={0} max={0.6} step={0.01} onChange={(v) => set('tintStrength', v)} />
        </div>

        <h2 className="mb-3 mt-5 text-sm font-semibold text-ink">Bühne</h2>
        <div className="flex flex-col gap-3">
          <Slider label="Größe" value={sizeScale} min={0.4} max={1.8} step={0.02} onChange={setSizeScale} />
          <Slider label="Verschmelzen" value={merge} min={0} max={1} step={0.02} onChange={setMerge}
            hint="Oberflächenspannung zwischen benachbarten Tropfen. Nur Stufe 3." />
        </div>
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
        Der Physik-Kern liegt in <code>src/lab/glassPhysics.ts</code> (TypeScript) und
        <code> src/lab/glassShader.ts</code> (GLSL) — beide bilden dieselben Formeln ab, damit dieser Vergleich
        wirklich die Technik vergleicht.
      </p>
    </div>
  )
}
