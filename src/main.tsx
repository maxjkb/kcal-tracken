import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './lib/persistence.ts'
import { initSyncIfSignedIn } from './lib/sync.ts'

// Fire-and-forget: ask the browser to exempt this origin's storage (API key,
// meals) from automatic eviction. Safe to call on every load.
void requestPersistentStorage()

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
