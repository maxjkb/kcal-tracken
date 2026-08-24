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
      <BottomNav onAddMeal={() => setAddingMeal(true)} />

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
