import { Sheet } from './Sheet'
import { CATEGORY_LABELS, episodeSeverityLabel, formatDateKey, SEVERITY_DISPLAY_LABEL, useIllnessEpisodes } from '../lib/illness'
import { useLatestSusceptibilityRun } from '../lib/susceptibility'

/**
 * Detail view opened by tapping SusceptibilityCard — an info text on how the
 * score is composed (explicit request), the current run's own preventive
 * tips, and a chronological detail list of past illnesses. All read-only;
 * the score itself is never recomputed from here (see
 * refreshSusceptibilityIfStale's own once-a-week gate).
 */
export function SusceptibilitySheet({ onClose }: { onClose: () => void }) {
  const run = useLatestSusceptibilityRun()
  const episodes = useIllnessEpisodes()
  const recentFirst = episodes ? [...episodes].reverse() : []

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5 pt-7">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Anfälligkeits-Score</h2>
          <p className="text-xs text-ink-soft">Eine grobe, illustrative Einschätzung — kein medizinischer Test.</p>
        </div>

        {run != null && (
          <div className="glass-subtle glass-subtle-themed flex items-center gap-4 rounded-2xl p-4">
            <div className="hero-num text-3xl text-ink">{run.score}</div>
            <p className="text-xs leading-relaxed text-ink-soft">{run.reasoning}</p>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Wie setzt sich der Score zusammen?</h3>
          <p className="text-xs leading-relaxed text-ink-soft">
            Der Score kombiniert die aktuelle Jahreszeit und, falls verfügbar, die aktuelle Außentemperatur an deinem
            Standort mit deiner Mikronährstoff-Versorgung der letzten Wochen sowie deiner eigenen Krankheitshistorie.
            Der Zusammenhang zwischen einzelnen Nährstoffen und alltäglichen Infekten ist wissenschaftlich eher
            uneinheitlich belegt — der Score ist deshalb bewusst als grobe Heuristik zu verstehen, nicht als
            verlässliche Vorhersage. Er aktualisiert sich höchstens einmal pro Woche, da sich seine Grundlagen nicht
            von Tag zu Tag ändern.
          </p>
          {run != null && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <ContextRow label="Jahreszeit" value={run.context.season} />
              <ContextRow
                label="Temperatur"
                value={run.context.weatherAvailable ? `${Math.round(run.context.temperatureC!)}°C` : 'nicht verfügbar'}
              />
              <ContextRow label="Krankheiten (90 Tage)" value={String(run.context.recentIllnessCount90d)} />
              <ContextRow label="Mikronährstoffe" value={run.context.micronutrientSummary} wide />
            </dl>
          )}
        </div>

        {run != null && run.tips.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Vorsorglich verbessern</h3>
            <ul className="flex flex-col gap-1.5">
              {run.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                  <span className="text-ink-faint">·</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Letzte Krankheiten</h3>
          {recentFirst.length === 0 ? (
            <p className="text-xs text-ink-soft">Bisher keine Krankheit erfasst.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentFirst.map((ep) => {
                const label = episodeSeverityLabel(ep)
                const avgSeverity = label ? SEVERITY_DISPLAY_LABEL[label] : null
                return (
                  <li key={ep.startDate} className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-ink">
                        {ep.startDate === ep.endDate ? formatDateKey(ep.startDate) : `${formatDateKey(ep.startDate)} – ${formatDateKey(ep.endDate)}`}
                      </span>
                      <span className="ml-1.5 text-ink-soft">{ep.category ? CATEGORY_LABELS[ep.category] : 'Ohne Angabe'}</span>
                    </div>
                    <span className="shrink-0 text-right text-ink-soft">
                      {ep.days} {ep.days === 1 ? 'Tag' : 'Tage'}
                      {avgSeverity && <span className="block text-[10px]">{avgSeverity}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function ContextRow({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-ink-soft">{value}</dd>
    </div>
  )
}
