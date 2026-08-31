import {
  db,
  newSupplementChatId,
  type SupplementChat,
  type SupplementChatMessage,
  type SupplementRecommendation,
} from './db'
import { callGeminiChatReply } from './gemini'
import { computeDailyTargets, getBodyProfile, GOAL_LABELS } from './bodyProfile'
import { getLatestAdvisorRun } from './supplementAdvisor'

function normalizeKey(name: string): string {
  return name.trim().toLowerCase()
}

/** The stored conversation for a supplement, or undefined if none exists yet — a `useLiveQuery` wrapper, not this function itself, is what makes SupplementChatSheet reactive to new messages. */
export function findSupplementChat(supplementName: string): Promise<SupplementChat | undefined> {
  return db.supplementChats.where('supplementKey').equals(normalizeKey(supplementName)).first()
}

/**
 * Opens (or reopens) the conversation for one recommendation — creates the
 * thread the first time, seeded with the recommendation's own reasoning +
 * effects text as the opening "model" turn, exactly per the request: "Die
 * erste Nachricht im Chat ist der ohnehin schon generierte Empfehlungstext."
 * Idempotent — calling this again for the same supplement just returns the
 * existing thread untouched, so reopening a chat never duplicates the
 * opening message or resets the conversation.
 */
export async function openSupplementChat(suggestion: SupplementRecommendation): Promise<SupplementChat> {
  const key = normalizeKey(suggestion.supplementName)
  const existing = await db.supplementChats.where('supplementKey').equals(key).first()
  if (existing) return existing

  const opening = [suggestion.reasoning, suggestion.effects].filter((s): s is string => Boolean(s?.trim())).join(' ')
  const chat: SupplementChat = {
    id: newSupplementChatId(),
    supplementKey: key,
    supplementName: suggestion.supplementName,
    messages: [{ role: 'model', text: opening, createdAt: Date.now() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.supplementChats.add(chat)
  return chat
}

const CHAT_SYSTEM_PROMPT_PREFIX = `Du bist ein Ernährungsassistent im Chat mit einem Nutzer, der eine Rückfrage zu EINEM konkreten Supplement hat, das dir zuvor bereits als Empfehlung angezeigt wurde. Der Chat-Verlauf beginnt mit genau dieser Empfehlung als deiner eigenen ersten Nachricht — der Nutzer kennt sie schon, wiederhole sie nicht, sondern gehe auf seine konkrete Rückfrage ein.

Nutze die unten stehenden Angaben zu seinem Körperziel und seiner tatsächlichen Ernährungslage, um wirklich individuell zu antworten (z.B. "bei deinem aktuellen Proteinschnitt von X g/Tag wäre..."), statt allgemeine Lehrbuch-Antworten zu geben. Bleibe beim Thema dieses einen Supplements und seinem Bezug zum Nutzer; für Fragen zu anderen Supplements verweise freundlich auf deren eigenen Chat.

Antworte kurz und konkret (in der Regel 2-5 Sätze, nur bei echtem Bedarf länger), auf Deutsch, in Fließtext (kein JSON, keine Aufzählungszeichen-Exzesse). Bleibe bei allgemein anerkannten, gut belegten Aussagen — keine individuelle medizinische Beratung, keine Diagnose, keine Dosierungsempfehlung außerhalb üblicher, breiter Spannen aus der Literatur. Weise bei Fragen, die über Ernährungsberatung hinausgehen (Vorerkrankungen, Medikamenteninteraktionen, Schwangerschaft), auf eine ärztliche/apothekerliche Abklärung hin, statt selbst zu spekulieren.`

/**
 * Builds the personalized half of the system prompt from the same data the
 * recommendation itself was grounded in — the latest advisor run's stored
 * context, reused rather than recomputed, so the chat's picture of "your
 * situation" always matches what the card's own reasoning was based on.
 */
async function buildPersonalContext(): Promise<string> {
  const bodyProfile = getBodyProfile()
  const lines = [
    bodyProfile ? `Körperziel: ${GOAL_LABELS[bodyProfile.goal]}` : 'Kein Körperziel hinterlegt (keine Körperwerte eingerichtet).',
  ]
  if (bodyProfile) {
    const targets = computeDailyTargets(bodyProfile)
    lines.push(
      `Tagesziel: ${Math.round(targets.kcal)} kcal, ${Math.round(targets.protein)}g Protein, ${Math.round(targets.carbs)}g Carbs, ${Math.round(targets.fat)}g Fett`,
    )
  }

  const latestRun = await getLatestAdvisorRun()
  if (latestRun) {
    const { averageIntake, periodDays, lowMicronutrients, established } = latestRun.context
    lines.push(
      `Tatsächlicher Durchschnitt der letzten ${periodDays} Tage: ${Math.round(averageIntake.kcal)} kcal, ${Math.round(averageIntake.protein)}g Protein, ${Math.round(averageIntake.carbs)}g Carbs, ${Math.round(averageIntake.fat)}g Fett`,
    )
    if (lowMicronutrients.length > 0) lines.push(`Mikronährstoffe mit erkennbarem Mangel: ${lowMicronutrients.join(', ')}`)
    if (established.length > 0) lines.push(`Bereits regelmäßig eingenommene Supplements: ${established.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * Sends the user's question, persisting it immediately (before the Gemini
 * round trip) so a failed reply never loses what they typed — the caller's
 * `useLiveQuery` on this chat already reflects the question the moment this
 * resolves the first `put`, independent of whether the second one (the
 * reply) ever lands. Throws (GeminiError or otherwise) if the reply itself
 * fails; the question stays saved either way.
 */
export async function sendSupplementChatMessage(chat: SupplementChat, question: string): Promise<SupplementChat> {
  const userMessage: SupplementChatMessage = { role: 'user', text: question, createdAt: Date.now() }
  const withUser: SupplementChat = { ...chat, messages: [...chat.messages, userMessage], updatedAt: Date.now() }
  await db.supplementChats.put(withUser)

  const personalContext = await buildPersonalContext()
  const systemPrompt = `${CHAT_SYSTEM_PROMPT_PREFIX}\n\n${personalContext}`

  const reply = await callGeminiChatReply(
    systemPrompt,
    withUser.messages.map((m) => ({ role: m.role, text: m.text })),
  )
  const modelMessage: SupplementChatMessage = { role: 'model', text: reply, createdAt: Date.now() }
  const withReply: SupplementChat = { ...withUser, messages: [...withUser.messages, modelMessage], updatedAt: Date.now() }
  await db.supplementChats.put(withReply)
  return withReply
}
