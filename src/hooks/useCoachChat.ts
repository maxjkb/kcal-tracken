import { createContext, useContext } from 'react'

/**
 * Opens the single, app-wide coach chat.
 *
 * Global brainstorm round (v2.1): the chat button moved out of the Supps
 * page's own header and into BottomNav (explicit request — "am besten
 * rechts neben Statistik"), which sits above every route, not just Supps.
 * Same shape as useAddMeal for the same reason: BottomNav has no other
 * reason to import a Supps-specific action, so App owns the open call and
 * hands it down through a context instead of prop-drilling it through
 * every route in between.
 */
export const CoachChatContext = createContext<(() => void) | null>(null)

export function useCoachChat(): () => void {
  const openCoachChat = useContext(CoachChatContext)
  if (!openCoachChat) throw new Error('useCoachChat must be used within CoachChatContext')
  return openCoachChat
}
