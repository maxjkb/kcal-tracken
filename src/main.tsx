import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './lib/persistence.ts'

// Fire-and-forget: ask the browser to exempt this origin's storage (API key,
// meals) from automatic eviction. Safe to call on every load.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
