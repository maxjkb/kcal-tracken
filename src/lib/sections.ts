/**
 * The four main areas, in the order they appear left-to-right in the bottom
 * nav — which is also the order the app's horizontal swipe gesture steps
 * through. One definition of "which page is next to which", so the nav and the
 * gesture can never disagree about adjacency.
 *
 * Lives here rather than in BottomNav so both that component and
 * SwipeNavigator can import it without either depending on the other's
 * rendering. "Einstellungen" is deliberately absent: it moved to each page's
 * header (PageHeader) and is not part of the swipe chain.
 */
export interface SectionTab {
  to: string
  label: string
  /** Exact-match only — needed for "/" so it doesn't match every route. */
  end: boolean
}

export const SECTION_TABS: SectionTab[] = [
  { to: '/recipes', label: 'Rezepte', end: false },
  { to: '/supplements', label: 'Supplements', end: false },
  { to: '/', label: 'Feed', end: true },
  { to: '/stats', label: 'Statistik', end: false },
]

/** Index into SECTION_TABS for a path, or -1 for anything outside the four areas (Einstellungen). */
export function sectionIndexForPath(pathname: string): number {
  // Longest match wins, so "/recipes/fruehstueck" resolves to Rezepte rather
  // than falling through — a whole area behaves as one page, like its color theme.
  let best = -1
  let bestLength = -1
  SECTION_TABS.forEach((tab, index) => {
    const matches = tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`)
    if (matches && tab.to.length > bestLength) {
      best = index
      bestLength = tab.to.length
    }
  })
  return best
}
