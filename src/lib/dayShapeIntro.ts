const SEEN_KEY = 'kcal-tracker:day-shape-intro-seen'

/**
 * Whether the one-time day-shape introduction has already been shown.
 *
 * Lives in lib/ rather than beside the component so the component file
 * exports only components (a mixed file breaks fast refresh for it), and so
 * both the Feed — which shows the introduction — and Einstellungen — which
 * offers to replay it — read one definition of the key.
 */
export function hasSeenDayShapeIntro(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // Private mode / blocked storage: treat as seen rather than reopening
    // the introduction on every single launch, which is far worse than
    // never showing it.
    return true
  }
}

export function markDayShapeIntroSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Nothing to do — see above.
  }
}

/** Clears the flag so the introduction plays again — Einstellungen → Version & Neues. */
export function resetDayShapeIntro(): void {
  try {
    localStorage.removeItem(SEEN_KEY)
  } catch {
    // Nothing to do — see above.
  }
}
