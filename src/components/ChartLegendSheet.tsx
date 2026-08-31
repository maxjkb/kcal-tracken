import { LINE_COLOR, TARGET_COLOR, TREND_COLOR } from './KcalTrendChart'
import { Sheet } from './Sheet'

/**
 * The color key for KcalTrendChart, plus the target-line explanation that
 * used to live in a small inline "Ziel"-chip above the chart. Both moved
 * here, behind the "i" button StatsPage places next to the chart card's own
 * heading, so the chart itself is left to just the plot and its bare
 * numbers — no legend text competing for the width a full-bleed chart needs.
 */
export function ChartLegendSheet({ hasTargetLine, onClose }: { hasTargetLine: boolean; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} sheetClassName="glass flex w-full max-w-lg flex-col rounded-t-3xl p-5 pt-7 sm:rounded-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Legende</h2>
      <div className="flex flex-col gap-4">
        <LegendRow color={LINE_COLOR} dashed={false} title="Kalorien" description="Was du in diesem Zeitraum tatsächlich erfasst hast." />
        <LegendRow color={TREND_COLOR} dashed title="Durchschnitt" description="Der Ø-Wert über die tatsächlich verstrichenen, dargestellten Punkte." />
        {hasTargetLine && (
          <LegendRow
            color={TARGET_COLOR}
            dashed={false}
            title="Ziel"
            description="Dein Tagesziel zum jeweiligen Zeitpunkt. Änderst du dein Ziel, gilt der neue Wert nur für neue Tage — bereits vergangene Tage behalten ihren damaligen Wert."
          />
        )}
      </div>
    </Sheet>
  )
}

function LegendRow({
  color,
  dashed,
  title,
  description,
}: {
  color: string
  dashed: boolean
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <svg viewBox="0 0 24 12" className="mt-1.5 h-3 w-6 shrink-0">
        <line x1="0" y1="6" x2="24" y2="6" stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? '5 4' : undefined} />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs leading-relaxed text-ink-soft">{description}</p>
      </div>
    </div>
  )
}
