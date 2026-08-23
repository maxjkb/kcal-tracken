import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { FeedPage } from './pages/FeedPage'
import { SettingsPage } from './pages/SettingsPage'
import { lazyRetry } from './lib/lazyRetry'

const StatsPage = lazy(lazyRetry(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage }))))

export default function App() {
  return (
    <div className="min-h-screen bg-bg">
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route
          path="/stats"
          element={
            <Suspense fallback={<p className="pt-10 text-center text-sm text-ink-soft">Lädt…</p>}>
              <StatsPage />
            </Suspense>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
