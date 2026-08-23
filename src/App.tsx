import { Suspense, lazy, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { FeedPage } from './pages/FeedPage'
import { SettingsPage } from './pages/SettingsPage'
import { MealEditor } from './components/MealEditor'
import { lazyRetry } from './lib/lazyRetry'
import { toLocalDateKey } from './lib/db'
import { guessMealType } from './lib/mealTypeGuess'

const StatsPage = lazy(lazyRetry(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage }))))

export default function App() {
  const [addingMeal, setAddingMeal] = useState(false)

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

      {/* Freischwebender Plus-Button — auf jeder Seite sichtbar, fügt immer für "Heute" hinzu. */}
      <button
        onClick={() => setAddingMeal(true)}
        aria-label="Mahlzeit hinzufügen"
        className="glass-accent fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-black/15"
      >
        <PlusIcon />
      </button>

      {addingMeal && (
        <MealEditor
          date={toLocalDateKey(new Date())}
          defaultMealType={guessMealType()}
          onClose={() => setAddingMeal(false)}
        />
      )}
    </div>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-6 w-6">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}
