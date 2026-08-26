import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './lib/persistence.ts'
import { initSyncIfSignedIn } from './lib/sync.ts'
import { syncSupplementCatalog } from './lib/supplementSeed.ts'
import { refreshAdvisorIfStale } from './lib/supplementAdvisor.ts'
import { refreshTipsIfStale } from './lib/tips.ts'
import { backfillMissingMicronutrients } from './lib/micronutrients.ts'

// Fire-and-forget: ask the browser to exempt this origin's storage (API key,
// meals) from automatic eviction. Safe to call on every load.
void requestPersistentStorage()

// Fire-and-forget: reconciles the built-in catalog on every launch, so a
// later expansion of the seed list reaches existing installs too and doesn't
// only ship to fresh ones. Writes nothing once everything is already in sync.
void syncSupplementCatalog()

// Fire-and-forget: refreshes the supplement suggestions once per calendar day,
// on the first launch of that day, so they're already waiting rather than
// needing a button press. Deliberately not awaited and never throws — see
// refreshAdvisorIfStale.
void refreshAdvisorIfStale()

// Fire-and-forget: refreshes the "was jetzt essen"-tips once per meal-time
// slot (breakfast/lunch/snack/dinner), on the first launch inside that slot,
// same reasoning and same silence as refreshAdvisorIfStale above.
void refreshTipsIfStale()

// Fire-and-forget: rough micronutrient estimates for meals logged before
// that field existed, up to a per-launch cap — see
// backfillMissingMicronutrients. Runs every launch; becomes a cheap no-op
// once nothing is left to fill in.
void backfillMissingMicronutrients()

// A no-op touchstart listener is the standard trick to make iOS Safari
// actually apply the :active pseudo-class on tap — without it, iOS treats
// taps as plain clicks and never enters :active at all, silently dropping
// every CSS press-feedback rule in the app on its main target platform.
document.addEventListener('touchstart', () => {}, { passive: true })

// Resumes sync automatically if a Firebase project is configured and this
// device already has a signed-in session from a previous visit.
initSyncIfSignedIn()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
