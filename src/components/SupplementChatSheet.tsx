import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SupplementChat, type SupplementRecommendation } from '../lib/db'
import { openSupplementChat, sendSupplementChatMessage } from '../lib/supplementChat'
import { GeminiError } from '../lib/gemini'
import { Sheet } from './Sheet'
import { BouncingDots } from './BouncingDots'
import { InfoButton } from './InfoButton'

/**
 * The per-supplement follow-up chat, opened from a recommendation card's
 * name/reasoning area (see SupplementsPage). First message is always the
 * recommendation's own reasoning + effects text, already generated and
 * already read on the card — reusing it here (rather than a blank chat)
 * means the conversation starts from context the user already has, not
 * from nothing (see lib/supplementChat.ts's openSupplementChat).
 *
 * Reads the thread via useLiveQuery rather than local state: sending a
 * message persists the user's question immediately, before the Gemini
 * round trip even starts, so it's never lost to a failed reply — the live
 * query picks that up on its own without this component tracking two
 * sources of truth.
 */
export function SupplementChatSheet({ suggestion, onClose }: { suggestion: SupplementRecommendation; onClose: () => void }) {
  const [ready, setReady] = useState(false)
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Creates the thread (idempotent) the first time this sheet ever opens for
  // this supplement — see openSupplementChat's own doc comment for why a
  // second open just returns the same thread instead of duplicating it.
  useEffect(() => {
    let cancelled = false
    void openSupplementChat(suggestion).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
    // suggestion is read once on mount — a new sheet instance opens per card tap anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chat: SupplementChat | undefined = useLiveQuery(
    () => db.supplementChats.where('supplementKey').equals(suggestion.supplementName.trim().toLowerCase()).first(),
    [suggestion.supplementName],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat?.messages.length])

  async function handleSend() {
    const text = question.trim()
    if (!text || !chat || sending) return
    setSending(true)
    setError(null)
    setQuestion('')
    try {
      await sendSupplementChatMessage(chat, text)
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Antwort.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{suggestion.supplementName}</h2>
          <p className="text-xs text-ink-soft">Rückfragen zu diesem Supp</p>
        </div>
        <div className="flex items-center gap-1.5">
          <InfoButton label="Hinweis zum Chat" title="Hinweis">
            Keine medizinische Beratung. Bei Vorerkrankungen, Medikamenten oder Schwangerschaft vorher ärztlich
            abklären.
          </InfoButton>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-bg"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {!ready || chat === undefined ? (
          <p className="py-8 text-center text-sm text-ink-soft">Lädt…</p>
        ) : (
          chat.messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user' ? 'self-end bg-accent text-white' : 'self-start bg-bg text-ink'
              }`}
            >
              {m.text}
            </div>
          ))
        )}
        {sending && (
          <div className="self-start rounded-2xl bg-bg px-4 py-2.5">
            <BouncingDots />
          </div>
        )}
        {error && <p className="self-start text-xs font-medium text-danger">{error}</p>}
      </div>

      <div className="shrink-0 border-t border-line/60 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder="Frage stellen…"
            rows={1}
            disabled={!chat || sending}
            className="max-h-24 min-h-[44px] flex-1 resize-none rounded-2xl bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!chat || sending || !question.trim()}
            aria-label="Senden"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M13 5l7 7-7 7" />
    </svg>
  )
}
