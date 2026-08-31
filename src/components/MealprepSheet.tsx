import { useState } from 'react'
import { newMealprepVersionId, type Recipe } from '../lib/db'
import { estimateMealprep, GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { describeSaveError } from '../lib/errors'
import { saveMealprepVersion } from '../hooks/useMealprep'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { BouncingDots } from './BouncingDots'

const QUANTITY_EXAMPLES = ['Doppelte Menge', '6 Portionen', 'Für die ganze Woche']

/**
 * Asks what quantity to scale this recipe to, then generates and saves a new
 * Mealprep version — see MealprepVersion's own doc comment in lib/db.ts for
 * why this is a separate, additional record rather than an edit to the
 * recipe itself.
 */
export function MealprepSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} sheetClassName="glass flex w-full max-w-lg flex-col rounded-t-3xl p-5 pt-7 sm:rounded-3xl">
      <MealprepSheetContent recipe={recipe} />
    </Sheet>
  )
}

function MealprepSheetContent({ recipe }: { recipe: Recipe }) {
  const requestClose = useSheetClose()
  const [targetDescription, setTargetDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasApiKey = Boolean(getApiKey())

  async function handleGenerate() {
    if (!targetDescription.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const estimate = await estimateMealprep({
        recipeTitle: recipe.title,
        originalIngredients: recipe.ingredients ?? [],
        originalSteps: (recipe.steps ?? []).map((s) => s.text),
        targetDescription,
      })
      await saveMealprepVersion({
        id: newMealprepVersionId(),
        recipeId: recipe.id,
        targetDescription: targetDescription.trim(),
        ingredients: estimate.ingredients,
        steps: estimate.steps.map((text, i) => ({ order: i, text })),
        nutrition: { kcal: estimate.kcal, protein: estimate.protein, carbs: estimate.carbs, fat: estimate.fat },
        cookTimeNote: estimate.cookTimeNote,
        storageNote: estimate.storageNote,
        createdAt: Date.now(),
      })
      requestClose()
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : describeSaveError(err, 'Mealprep-Version'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">Mealprep erstellen</h2>
      <p className="text-sm text-ink-soft">
        Für welche Menge soll <span className="font-medium text-ink">{recipe.title}</span> skaliert werden? Die KI
        passt Zutatenmengen, Zubereitung, Garzeit und Lagerung darauf an — nicht per einfachem Dreisatz, sondern mit
        kulinarischem Sachverstand (Gewürze und Flüssigkeiten skalieren z.B. nicht linear mit).
      </p>

      <input
        type="text"
        value={targetDescription}
        onChange={(e) => setTargetDescription(e.target.value)}
        placeholder="z.B. 6 Portionen"
        disabled={generating}
        className="rounded-2xl border border-line bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />

      <div className="flex flex-wrap gap-1.5">
        {QUANTITY_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setTargetDescription(example)}
            disabled={generating}
            className="rounded-full bg-bg px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-line disabled:opacity-40"
          >
            {example}
          </button>
        ))}
      </div>

      {!hasApiKey && (
        <p className="rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
          Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.
        </p>
      )}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !hasApiKey || !targetDescription.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating ? (
          <>
            <BouncingDots /> Wird erstellt…
          </>
        ) : (
          'Mealprep-Version erstellen'
        )}
      </button>
    </div>
  )
}
