import { useState } from 'react'
import { useSupplementScore } from '../hooks/useSupplements'
import { GlassSurface } from '../glass/GlassSurface'
import { ChevronIcon } from './ChevronIcon'
import { SuppScoreSheet } from './SuppScoreSheet'

/** Past this score the card calls out a small "gut dabei" nudge — a cheap, one-line
  * way to make a high score feel like it earned something, without a whole badge system. */
const GOOD_SCORE_THRESHOLD = 80

/**
 * "Supplementscore" — a cumulative, all-time figure (see
 * lib/supplementScore.ts), not bound to whichever period Statistik happens
 * to have selected any more: how many of the configured daily slots have
 * ever been checked off, both overall and per supplement, since each entry
 * was actually added. Tapping the card opens SuppScoreSheet for the full
 * per-supplement breakdown and a calendar overview, rather than the
 * Supplements page's "Heute" tab — the score earned its own destination
 * once it stopped being a Statistik-period side note.
 *
 * Formerly "Supplement-Treue", shown as a plain percentage. Same underlying
 * math (checked slots ÷ total slots), 1:1 renamed to a 0-100 point score
 * per explicit request — "ein bisschen mehr Gamification". A point score
 * reads as something to chase in a way a percentage doesn't quite (nobody
 * says "I scored 80 percent today" out loud the way they'd say "I scored 80
 * points"), which is the entire difference here: the number itself is
 * unchanged, only what it's called and how it's framed.
 */
export function SupplementScoreCard() {
  const score = useSupplementScore()
  const [open, setOpen] = useState(false)

  if (score === undefined) return null
  if (score.rows.length === 0) return null

  return (
    <>
      {/* The whole card opens SuppScoreSheet rather than just the score
          number — a bigger, more forgiving target, and there's nothing else
          interactive inside to compete with it for the tap. A Sheet now, not
          a route (`/supplements/score` used to exist) — the same sheet the
          Supplements page's own trophy header button opens. */}
      <GlassSurface
        rim={24}
        as="button"
        type="button"
        onClick={() => setOpen(true)}
        className="glass-subtle glass-subtle-themed mt-4 block w-full rounded-3xl p-5 text-left shadow-sm shadow-black/5 transition active:opacity-80"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Supplementscore</h2>
          <span className="flex items-center gap-1.5">
            {score.overallScore !== null && (
              <span className="flex items-baseline gap-1">
                <TrophyIcon
                  className={`h-4 w-4 ${score.overallScore >= GOOD_SCORE_THRESHOLD ? 'text-accent' : 'text-ink-faint'}`}
                />
                <span className="text-lg font-bold text-accent">{score.overallScore}</span>
                <span className="text-xs font-medium text-ink-soft">/ 100</span>
              </span>
            )}
            <ChevronIcon direction="right" className="h-4 w-4 shrink-0 text-ink-faint" />
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {score.rows.map((r) => {
            const rowScore = r.totalSlots > 0 ? Math.round((r.checkedSlots / r.totalSlots) * 100) : null
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink-soft">{r.name}</span>
                <span className="shrink-0 text-xs text-ink-soft">
                  {rowScore === null ? '–' : `${r.checkedSlots}/${r.totalSlots} · ${rowScore} Pkt.`}
                </span>
              </div>
            )
          })}
        </div>
        {score.overallScore !== null && score.overallScore >= GOOD_SCORE_THRESHOLD && (
          <p className="mt-3 text-xs font-medium text-accent">Stark dabei — weiter so!</p>
        )}
      </GlassSurface>
      {open && <SuppScoreSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function TrophyIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 12v3M9 19h6M10 19v-2.5a2 2 0 0 1 4 0V19" />
    </svg>
  )
}
