import { useEffect, useState } from 'react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { QuotaBar } from '../../components/QuotaBar'
import { GEMINI_MODELS, exhaustedModels } from '../../lib/geminiModels'
import { getAllUsage, nextResetAt, onUsageChange } from '../../lib/usageQuota'
import { SIGN_IN_EMAIL_USAGE_ID } from '../../lib/firebase'

/**
 * Firebase publishes no number for the daily sign-in-email allowance, and it is
 * deliberately low on the free Spark tier. This is a working figure to measure
 * against, not a documented limit — the copy below says so.
 */
const SIGN_IN_EMAIL_ASSUMED_LIMIT = 20

/**
 * How much of today's request allowances this installation has used.
 *
 * The honesty problem this screen has to solve: **neither service will tell us
 * the real number.** Gemini exposes no usage endpoint to an API key, and
 * Firebase exposes the sign-in-email allowance not at all. So these bars count
 * what this device sent and compare it against the published limits — a lower
 * bound, which the note at the bottom states plainly rather than leaving the
 * bars to imply otherwise.
 */
export function QuotaSettingsPage() {
  const [usage, setUsage] = useState(() => getAllUsage())
  const [spent, setSpent] = useState(() => exhaustedModels())

  // Live: a request made while this screen is open moves its bar.
  useEffect(
    () =>
      onUsageChange(() => {
        setUsage(getAllUsage())
        setSpent(exhaustedModels())
      }),
    [],
  )

  const reset = nextResetAt()
  const emailsSent = usage[SIGN_IN_EMAIL_USAGE_ID] ?? 0

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Kontingent" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Gemini — Anfragen heute</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink-soft">
          Zurückgesetzt wird um Mitternacht pazifischer Zeit, bei dir also{' '}
          {reset.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} Uhr.
        </p>

        <div className="flex flex-col gap-4">
          {GEMINI_MODELS.map((model) => (
            <div key={model.id}>
              <QuotaBar
                used={usage[`gemini:${model.id}`] ?? 0}
                limit={model.dailyLimit}
                label={model.label}
              />
              {spent.includes(model.id) && (
                <p className="mt-1 text-[11px] font-medium text-danger">
                  Kontingent laut Gemini aufgebraucht — wird bis zum Zurücksetzen übersprungen.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Firebase — Anmelde-E-Mails heute</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink-soft">
          Auf dem kostenlosen Spark-Tarif ist diese Zahl bewusst niedrig. Google nennt keinen genauen Wert;
          die {SIGN_IN_EMAIL_ASSUMED_LIMIT} unten sind ein Erfahrungswert, kein dokumentiertes Limit.
        </p>
        <QuotaBar used={emailsSent} limit={SIGN_IN_EMAIL_ASSUMED_LIMIT} label="Anmeldelinks" />
      </section>

      <section className="rounded-3xl bg-fat/15 p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Wie genau ist das?</h2>
        <p className="text-xs leading-relaxed text-ink">
          Weder Gemini noch Firebase geben den tatsächlichen Verbrauch heraus — es gibt schlicht keine
          Schnittstelle dafür, die eine App im Browser abfragen könnte. Gezählt wird deshalb, was{' '}
          <span className="font-semibold">dieses Gerät</span> sendet. Anfragen von einem anderen Gerät, aus einem
          anderen Browser oder von einer anderen App mit demselben API-Key sind hier nicht enthalten. Die Zahlen
          sind also eine Untergrenze: mehr kann verbraucht sein, weniger nicht.
        </p>
      </section>
    </div>
  )
}
