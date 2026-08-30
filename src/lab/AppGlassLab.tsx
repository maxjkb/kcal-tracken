import { useCallback, useState } from 'react'
import { NutrientRings } from '../components/NutrientRings'
import { MealTypeBadge } from '../components/MealTypeBadge'
import { ChevronIcon } from '../components/ChevronIcon'
import { TopGradient } from '../components/TopGradient'
import { useLightSource } from './useLightSource'
import { GlassStage, type GlassStats } from './appGlass/GlassStage'
import { useGlassSurface } from './appGlass/glassSurfaces'

/**
 * Der Integrations-Prototyp: kann die WebGL-Glasebene die CSS-Materialien in
 * der echten App ersetzen?
 *
 * Die Seite ist eine originalgetreue Nachbildung des Feed-Bildschirms — die
 * echten Klassen, die echten Farbtoken, die echten Ring-Komponenten —, damit
 * die Antwort nicht an einer Laborsituation hängt. Umschalter oben, Messung
 * unten, dieselbe Seite dazwischen.
 *
 * Bewusst NICHT umgestellt: die Bedienleiste. Sie ist `fixed`, unter ihr
 * scrollen Mahlzeitenkarten mit Text durch — und Text ist DOM, für einen
 * Shader unerreichbar. Sie behält `backdrop-filter`, und das ist keine
 * Übergangslösung, sondern die richtige Antwort für diese eine Stelle.
 */

/** Eine Glasfläche im Prototyp: meldet sich beim Shader an und tritt zurück, sobald der zeichnet. */
function Surface({
  rim = 22, className = '', children, as: Tag = 'div',
}: {
  rim?: number
  className?: string
  children?: React.ReactNode
  as?: 'div' | 'section'
}) {
  const ref = useGlassSurface<HTMLDivElement>(rim)
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} className={`gl-surface ${className}`}>
      {children}
    </Tag>
  )
}

const MEALS = [
  { type: 'breakfast' as const, title: 'Haferflocken mit Beeren', kcal: 420 },
  { type: 'lunch' as const, title: 'Hähnchenbrust mit Reis und Brokkoli', kcal: 680 },
  { type: 'dinner' as const, title: 'Nudeln mit Hackbällchen', kcal: 950 },
  { type: 'snack' as const, title: 'Skyr mit Honig', kcal: 210 },
]

function Stat({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${warn ? 'text-danger' : 'text-ink'}`}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-ink-soft">{unit}</span>}
      </span>
    </div>
  )
}

export function AppGlassLab() {
  const [glOn, setGlOn] = useState(true)
  const [stats, setStats] = useState<GlassStats | null>(null)
  const { setContainer, lightRef } = useLightSource()

  const onStats = useCallback((s: GlassStats) => setStats(s), [])
  const software = stats ? /swiftshader|llvmpipe|software|mesa/i.test(stats.renderer) : false

  return (
    <div ref={setContainer}>
      {/* App.tsx rendert auf dieser Route keinen TopGradient (sectionForPath
          liefert null). Fuer den CSS-Vergleich muss er aber da sein, sonst
          fehlt der Haelfte des Vergleichs der halbe Hintergrund. */}
      <TopGradient />
      <GlassStage lightRef={lightRef} enabled={glOn} onStats={onStats} />

      <div className="mx-auto max-w-lg px-4 pb-40">
        {/* --- Kopfzeile, wie PageHeader: sticky, liegt über scrollendem Inhalt --- */}
        <div className="sticky top-0 z-30 -mx-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-3">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-bg/92 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
          />
          <div className="relative flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-bold text-ink">Feed</h1>
            <div className="flex gap-2">
              {/* Diese beiden bleiben CSS: sie sitzen in der sticky-Kopfzeile,
                  unter der Inhalt durchläuft — derselbe Fall wie die Bedienleiste. */}
              <span className="glass-subtle glass-subtle-themed flex h-11 w-11 items-center justify-center rounded-full text-section shadow-sm shadow-black/5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
                </svg>
              </span>
              <span className="glass-accent flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold">
                +
              </span>
            </div>
          </div>
        </div>

        {/* --- Umschalter --------------------------------------------------- */}
        {/* Kein <Surface>: der Umschalter muss in beiden Zustaenden identisch
            aussehen, sonst vergleicht man ihn mit sich selbst statt die Seite. */}
        <div className="mb-4 flex gap-1 rounded-full border border-line bg-surface p-1 shadow-sm shadow-black/5">
          {([['CSS (heute)', false], ['WebGL (Prototyp)', true]] as const).map(([label, on]) => (
            <button
              key={label}
              type="button"
              onClick={() => setGlOn(on)}
              aria-pressed={glOn === on}
              className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition-colors ${
                glOn === on ? 'bg-accent text-white' : 'text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* --- Datumsleiste: im Fluss, dahinter nur der Hintergrund ---------- */}
        <Surface rim={22} className="glass mb-4 flex items-center justify-between rounded-2xl px-2 py-2 shadow-sm shadow-black/5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white">
            <ChevronIcon direction="left" />
          </span>
          <span className="px-3 py-3 text-lg font-semibold text-ink">Heute</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white">
            <ChevronIcon direction="right" />
          </span>
        </Surface>

        {/* --- Nährwertkarte: die größte Glasfläche der App ------------------ */}
        <Surface rim={26} className="glass-subtle glass-subtle-themed mb-6 rounded-3xl p-5 shadow-sm shadow-black/5">
          <NutrientRings
            kcal={2260}
            protein={128}
            carbs={241}
            fat={74}
            targets={{ kcal: 2400, protein: 150, carbs: 270, fat: 80 }}
          />
        </Surface>

        {/* --- Mahlzeiten: unter der Bedienleiste durchscrollender Inhalt ---- */}
        <div className="flex flex-col gap-6">
          {MEALS.map((m) => (
            <section key={m.type}>
              <div className="mb-2 flex items-center gap-2">
                <MealTypeBadge type={m.type} size="sm" />
                <h2 className="text-lg font-semibold text-ink">{m.title.split(' ')[0]}</h2>
              </div>
              <Surface rim={20} className="glass-subtle flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                  <p className="text-xs text-ink-soft">Kontrasttest — dieser Text liegt auf dem Material</p>
                </div>
                <span className="shrink-0 rounded-full bg-accent/12 px-2.5 py-1 text-xs font-semibold text-accent">
                  {m.kcal} kcal
                </span>
              </Surface>
            </section>
          ))}
        </div>

        {/* --- Messung ------------------------------------------------------- */}
        <section className="glass-subtle glass-subtle-themed mt-8 rounded-3xl p-4 shadow-sm shadow-black/5">
          <h2 className="mb-1 text-sm font-semibold text-ink">Messung</h2>
          <p className="mb-3 text-[11px] leading-relaxed text-ink-soft">
            Gemessen auf <em>diesem</em> Gerät, während du scrollst oder den Finger bewegst. Im Ruhezustand hält die
            Schleife an — dann steht hier „ruht".
          </p>
          {stats ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Bilder/s" value={stats.idle ? '—' : stats.fps.toFixed(0)} />
                <Stat label="Frame p95" value={stats.frameP95.toFixed(1)} unit="ms" warn={stats.frameP95 > 20} />
                <Stat label="Bilder gesamt" value={String(stats.frames)} />
                <Stat label="Stil lesen" value={stats.styleMs.toFixed(2)} unit="ms" warn={stats.styleMs > 2} />
                <Stat label="Position lesen" value={stats.rectMs.toFixed(2)} unit="ms" warn={stats.rectMs > 2} />
                <Stat label="Zeichnen" value={stats.drawMs.toFixed(2)} unit="ms" warn={stats.drawMs > 4} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                Zustand: <span className="font-medium text-ink-soft">{stats.idle ? 'ruht — Schleife angehalten' : `zeichnet, ${stats.shapes} Formen`}</span>.
                „Stil lesen" ist das getComputedStyle für die Farbtoken, „Position lesen" das
                getBoundingClientRect aller Flächen, „Zeichnen" das Absetzen der Zeichenbefehle —
                nicht die Zeit, die die Grafikeinheit danach braucht.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                Grafikeinheit: <span className="font-mono text-[10px] text-ink-soft">{stats.renderer}</span>
              </p>
              {software && (
                <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-[11px] font-medium leading-relaxed text-danger">
                  Dieser Browser rechnet in Software, nicht auf der Grafikeinheit. Bilder/s und Frame p95 sind hier
                  wertlos — nur die CPU-Werte („Stil lesen", „Position lesen") und der Ruhezustand sagen etwas aus.
                  Für eine belastbare Zahl muss diese Seite auf dem echten Gerät laufen.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-ink-soft">{glOn ? 'Warte auf das erste Bild…' : 'Ebene ist aus — auf „WebGL" umschalten.'}</p>
          )}
        </section>

        <section className="mt-4 rounded-3xl border border-line p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Worauf zu achten ist</h2>
          <ul className="flex flex-col gap-2 text-[11px] leading-relaxed text-ink-soft">
            <li>
              <b className="text-ink">Umschalten.</b> Der Unterschied muss die Umstellung wert sein — sonst gewinnt die
              Lösung, die weniger bewegliche Teile hat.
            </li>
            <li>
              <b className="text-ink">Bedienleiste beim Scrollen.</b> Sie bleibt auf CSS und verwischt die Karten
              darunter live. Genau das kann die WebGL-Ebene nicht.
            </li>
            <li>
              <b className="text-ink">Text auf den Karten.</b> Das Glanzlicht ist im Shader gedeckelt, damit der
              Kontrast nicht mit der Lichtposition schwankt. Wandert der Finger darüber, darf der Text nicht blasser
              werden.
            </li>
            <li>
              <b className="text-ink">Kopfzeile.</b> Die beiden Knöpfe oben rechts bleiben ebenfalls CSS — sie sitzen
              in der sticky-Leiste. Ob der Materialbruch zwischen ihnen und den Flächen darunter auffällt, ist die
              eigentliche Gestaltungsfrage.
            </li>
          </ul>
        </section>
      </div>

      {/* --- Bedienleiste: bleibt CSS, siehe Kommentar oben ------------------ */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="glass pointer-events-auto mx-4 flex gap-1 rounded-full p-1.5">
          {['Rezepte', 'Supp.', 'Feed', 'Statistik'].map((l, i) => (
            <span
              key={l}
              className={`flex h-11 items-center rounded-full px-4 text-xs font-medium ${
                i === 2 ? 'glass-accent' : 'text-ink-soft'
              }`}
            >
              {l}
            </span>
          ))}
        </div>
      </nav>
    </div>
  )
}
