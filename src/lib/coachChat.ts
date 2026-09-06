import { db, type CoachChat, type CoachChatMessage } from './db'
import { callGeminiChatReply } from './gemini'
import { buildPersonalContext } from './supplementChat'

/** Fixed id: there is exactly one coach conversation, not one per topic. */
const COACH_CHAT_ID = 'coach'

const OPENING_MESSAGE =
  'Hi! Frag mich alles zu deiner Ernährung, deinem Training oder deinen Supps — ich kenne deine geloggten Werte und kann darauf eingehen.'

/**
 * Opens (or reopens) the single app-wide coach conversation — creates it
 * the first time, seeded with a short opening line so the chat never starts
 * from a blank screen. Idempotent, same as openSupplementChat: reopening
 * just returns the existing thread, never resets or duplicates it.
 */
export async function getOrCreateCoachChat(): Promise<CoachChat> {
  const existing = await db.coachChat.get(COACH_CHAT_ID)
  if (existing) return existing

  const chat: CoachChat = {
    id: COACH_CHAT_ID,
    messages: [{ role: 'model', text: OPENING_MESSAGE, createdAt: Date.now() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.coachChat.add(chat)
  return chat
}

const COACH_SYSTEM_PROMPT_PREFIX = `Du bist ein persönlicher Ernährungsberater und Fitnesscoach in der App "Tracke". Der Nutzer kann dich zu allem rund um seine Ernährung, sein Training und seine Nahrungsergänzung fragen — anders als ein Chat zu einer einzelnen Supplement-Empfehlung bist du hier nicht auf ein Thema beschränkt.

Nutze die unten stehenden Angaben zu seinem Körperziel und seiner tatsächlichen Ernährungslage, um wirklich individuell zu antworten (z.B. "bei deinem aktuellen Proteinschnitt von X g/Tag wäre..."), statt allgemeine Lehrbuch-Antworten zu geben.

Nenne Nahrungsergänzungsmittel im Text durchgehend "Supp" bzw. "Supps" statt "Supplement"/"Supplements" — so heißen sie in der App.

Antworte kurz und konkret (in der Regel 2-5 Sätze, nur bei echtem Bedarf länger), auf Deutsch, in Fließtext (kein JSON, keine Aufzählungszeichen-Exzesse). Bleibe bei allgemein anerkannten, gut belegten Aussagen — keine individuelle medizinische Beratung, keine Diagnose, keine Dosierungsempfehlung außerhalb üblicher, breiter Spannen aus der Literatur. Weise bei Fragen, die über Ernährungsberatung hinausgehen (Vorerkrankungen, Medikamenteninteraktionen, Schwangerschaft), auf eine ärztliche/apothekerliche Abklärung hin, statt selbst zu spekulieren.`

/**
 * Sends the user's question, persisting it immediately (before the Gemini
 * round trip) so a failed reply never loses what they typed — same pattern
 * as sendSupplementChatMessage, for the same reason.
 */
export async function sendCoachChatMessage(chat: CoachChat, question: string): Promise<CoachChat> {
  const userMessage: CoachChatMessage = { role: 'user', text: question, createdAt: Date.now() }
  const withUser: CoachChat = { ...chat, messages: [...chat.messages, userMessage], updatedAt: Date.now() }
  await db.coachChat.put(withUser)

  const personalContext = await buildPersonalContext()
  const systemPrompt = `${COACH_SYSTEM_PROMPT_PREFIX}\n\n${personalContext}`

  const reply = await callGeminiChatReply(
    systemPrompt,
    withUser.messages.map((m) => ({ role: m.role, text: m.text })),
  )
  const modelMessage: CoachChatMessage = { role: 'model', text: reply, createdAt: Date.now() }
  const withReply: CoachChat = { ...withUser, messages: [...withUser.messages, modelMessage], updatedAt: Date.now() }
  await db.coachChat.put(withReply)
  return withReply
}
