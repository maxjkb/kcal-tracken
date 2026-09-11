import { useState } from 'react'
import {
  averageEpisodeDurationDays,
  averageSeverityLabel,
  formatDateKey,
  mostRecentEpisode,
  SEVERITY_DISPLAY_LABEL,
  useIllnessEpisodes,
} from '../lib/illness'
import { useLatestSusceptibilityRun } from '../lib/susceptibility'
import { GlassSurface } from '../glass/GlassSurface'
import { ChevronIcon } from './ChevronIcon'
import { ThermometerIcon } from './SickDayButton'
import { SusceptibilitySheet } from './SusceptibilitySheet'

/** Score at/above this reads as "erhöht" (warning red) rather than the normal ink color — same binary threshold style as the Bilanz tile's own color switch. */
const ELEVATED_SCORE_THRESHOLD = 60

/**
 * Replaces the old bar chart entirely (explicit request: "Balken Diagramm
 * macht kein Sinn"). Leads with the Anfälligkeits-Score — a soft, weekly-
 * refreshed heuristic (see lib/susceptibility.ts) — plus the three concrete
 * numbers actually asked for: Ø Tage/Krankheit, wann zuletzt krank, und der
 * durchschnittliche Verlauf. Tapping opens SusceptibilitySheet for the full
 * breakdown and illness history.
 */
export function SusceptibilityCard() {
  const episodes = useIllnessEpisodes()
  const run = useLatestSusceptibilityRun()
  const [open, setOpen] = useState(false)

  const avgDuration = episodes ? averageEpisodeDurationDays(episodes) : null
  const recent = episodes ? mostRecentEpisode(episodes) : null
  const severityLabel = episodes ? averageSeverityLabel(episodes) : null

  const elevated = run != null && run.score >= ELEVATED_SCORE_THRESHOLD

  return (
    <>
      <GlassSurface
        rim={24}
        as="button"
        type="button"
        onClick={() => setOpen(true)}
        className="glass-subtle glass-subtle-themed block w-full rounded-3xl p-5 text-left shadow-sm shadow-black/5 transition active:opacity-80"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--color-warning)' }}>
              <ThermometerIcon className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-ink">Krankheit</h2>
          </div>
          <span className="flex items-center gap-1.5">
            {run != null && (
              <span className="flex items-baseline gap-1">
                <span className="hero-num text-lg" style={{ color: elevated ? 'var(--color-warning)' : 'var(--color-ink)' }}>
                  {run.score}
                </span>
                <span className="text-xs font-medium text-ink-soft">/ 100</span>
              </span>
            )}
            <ChevronIcon direction="right" className="h-4 w-4 shrink-0 text-ink-faint" />
          </span>
        </div>

        {run == null ? (
          <p className="text-xs text-ink-soft">
            Anfälligkeits-Score wird berechnet, sobald ein API-Key hinterlegt ist — läuft danach automatisch einmal
            pro Woche im Hintergrund mit.
          </p>
        ) : (
          <p className="mb-3 text-xs text-ink-soft">{run.reasoning}</p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Ø Tage/Krankheit" value={avgDuration === null ? '–' : avgDuration.toFixed(1)} />
          <Stat label="Zuletzt krank" value={recent === null ? '–' : formatDateKey(recent.endDate)} />
          <Stat label="Verlauf" value={severityLabel === null ? '–' : SEVERITY_DISPLAY_LABEL[severityLabel]} small />
        </div>
      </GlassSurface>
      {open && <SusceptibilitySheet onClose={() => setOpen(false)} />}
    </>
  )
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-bg px-1.5 py-2">
      <div className={small ? 'text-xs font-semibold text-ink' : 'hero-num text-sm text-ink'}>{value}</div>
      <div className="mt-0.5 text-[10px] leading-tight text-ink-soft">{label}</div>
    </div>
  )
}
