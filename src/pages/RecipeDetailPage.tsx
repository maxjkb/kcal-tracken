import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRegisterBackSwipe } from '../lib/backSwipe'
import { formatIngredientAmount, type MealprepVersion } from '../lib/db'
import { useRecipe } from '../hooks/useRecipes'
import { useMealprepVersions, deleteMealprepVersion } from '../hooks/useMealprep'
import { RecipeEditor } from '../components/RecipeEditor'
import { MealprepSheet } from '../components/MealprepSheet'
import { ChevronIcon } from '../components/ChevronIcon'
import { MacroBadge, MacroRingBadge } from '../components/MacroBadge'
import { SlideInPage } from '../components/SlideInPage'
import { Collapse } from '../components/Collapse'
import { MEAL_TYPE_COLOR } from '../lib/mealTypeColor'
import { GlassSurface } from '../glass/GlassSurface'

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

function IngredientsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v6a2 2 0 0 0 2 2v10M7 3v6a2 2 0 0 1-2 2v10M17 3c-1.7 0-3 2-3 6s1.3 6 3 6v6" />
    </svg>
  )
}

function StepsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MealprepIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <rect x="3.5" y="8" width="17" height="12" rx="2" />
      <path strokeLinecap="round" d="M3.5 12.5h17M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    </svg>
  )
}

/**
 * One recipe's detail.
 *
 * Redesigned around the same idea as the category page's header: a colored
 * hero band, sized for the title and macros to breathe, replacing the plain
 * text block the page opened with before. Zutaten/Zubereitung/Mealprep are
 * now each their own card (previously bare text sitting directly on the
 * page background) — the actual fix for "fehlende optische Elemente /
 * langweilig", since a wall of un-cardified list items was the concrete
 * thing making this page read as plain text regardless of font size.
 * Steps get numbered circles instead of a bare "1." for the same reason.
 */
export function RecipeDetailPage() {
  const { category, id } = useParams<{ category: string; id: string }>()
  const navigate = useNavigate()
  // Swiping right means what the back arrow above means. Registered rather
  // than handled locally so it shares the app's one gesture recogniser.
  useRegisterBackSwipe(() => navigate(`/recipes/${category}`))
  const recipe = useRecipe(id)
  const mealprepVersions = useMealprepVersions(id ?? '')
  const [ingredientsOpen, setIngredientsOpen] = useState(true)
  const [stepsOpen, setStepsOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [creatingMealprep, setCreatingMealprep] = useState(false)
  const [openMealprepId, setOpenMealprepId] = useState<string | null>(null)

  // `undefined` is Dexie still resolving; `null` is a genuine miss. Treating
  // both as "loading" left a deleted or mistyped recipe id showing "Lädt…"
  // forever, with the back arrow as the only way out and no hint why.
  if (recipe === null) {
    return (
      <SlideInPage>
        <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
          <p className="py-10 text-center text-sm text-ink-soft">Dieses Rezept gibt es nicht mehr.</p>
          <Link to="/recipes" className="block text-center text-sm font-semibold text-accent">
            Zurück zu den Rezepten
          </Link>
        </div>
      </SlideInPage>
    )
  }

  if (!recipe) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      </div>
    )
  }

  const color = MEAL_TYPE_COLOR[recipe.category]

  return (
    <SlideInPage>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div
          className="relative mb-5 overflow-hidden rounded-3xl p-5 shadow-sm shadow-black/5"
          style={{ background: `color-mix(in srgb, ${color} 16%, var(--color-bg))` }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl"
            style={{ background: color }}
          />
          <div className="relative z-10">
            <Link
              to={`/recipes/${recipe.category}`}
              aria-label="Zurück"
              className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 hover:text-ink"
            >
              <ChevronIcon direction="left" />
            </Link>

            <h2 className="mb-3 text-2xl font-bold tracking-tight text-ink">{recipe.title}</h2>

            <div className="flex flex-wrap items-center gap-2.5">
              <MacroBadge type="kcal" value={recipe.nutrition.kcal} />
              <MacroRingBadge type="protein" value={recipe.nutrition.protein} />
              <MacroRingBadge type="carbs" value={recipe.nutrition.carbs} />
              <MacroRingBadge type="fat" value={recipe.nutrition.fat} />
            </div>
          </div>
        </div>

        {recipe.ingredients.length > 0 && (
          <GlassSurface rim={24} className="glass-subtle glass-subtle-themed mb-4 rounded-3xl p-4 shadow-sm shadow-black/5">
            <button
              onClick={() => setIngredientsOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <IngredientsIcon className="h-4 w-4 text-section" />
                Zutaten
              </span>
              <ChevronDown open={ingredientsOpen} />
            </button>
            <Collapse open={ingredientsOpen}>
              <div className="mt-3 flex flex-col divide-y divide-line/60">
                {recipe.ingredients.map((ing, i) => (
                  <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{ing.name}</span>
                      <span className="shrink-0 text-xs font-medium text-ink-soft">{formatIngredientAmount(ing)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {Math.round(ing.kcal)} kcal · {Math.round(ing.protein)}g Protein · {Math.round(ing.carbs)}g Carbs ·{' '}
                      {Math.round(ing.fat)}g Fett
                    </p>
                    {ing.note && <p className="mt-0.5 text-xs italic text-ink-soft">{ing.note}</p>}
                  </div>
                ))}
              </div>
            </Collapse>
          </GlassSurface>
        )}

        {recipe.steps.length > 0 && (
          <GlassSurface rim={24} className="glass-subtle glass-subtle-themed mb-4 rounded-3xl p-4 shadow-sm shadow-black/5">
            <button onClick={() => setStepsOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <StepsIcon className="h-4 w-4 text-section" />
                Zubereitung
              </span>
              <ChevronDown open={stepsOpen} />
            </button>
            <Collapse open={stepsOpen}>
              <ol className="mt-3 flex flex-col gap-3">
                {recipe.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-section-12 text-xs font-bold text-section">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed">{s.text}</span>
                  </li>
                ))}
              </ol>
            </Collapse>
          </GlassSurface>
        )}

        <GlassSurface rim={24} className="glass-subtle glass-subtle-themed mb-5 rounded-3xl p-4 shadow-sm shadow-black/5">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <MealprepIcon className="h-4 w-4 text-section" />
              Mealprep
            </span>
            <button
              type="button"
              onClick={() => setCreatingMealprep(true)}
              className="text-xs font-semibold text-accent hover:underline"
            >
              + Neue Version
            </button>
          </div>
          {!mealprepVersions || mealprepVersions.length === 0 ? (
            <p className="text-xs text-ink-soft">
              Noch keine Mealprep-Version. Erstelle eine, um dieses Rezept auf eine andere Menge skaliert zu
              zubereiten — mit angepasster Garzeit und Lagerungshinweis.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {mealprepVersions.map((version) => (
                <MealprepVersionCard
                  key={version.id}
                  version={version}
                  open={openMealprepId === version.id}
                  onToggle={() => setOpenMealprepId((cur) => (cur === version.id ? null : version.id))}
                  onDelete={() => deleteMealprepVersion(version.id)}
                />
              ))}
            </div>
          )}
        </GlassSurface>

        <button
          onClick={() => setEditing(true)}
          className="glass-accent flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold transition"
        >
          <EditIcon />
          Bearbeiten
        </button>
      </div>

      {editing && <RecipeEditor category={recipe.category} initial={recipe} onClose={() => setEditing(false)} />}
      {creatingMealprep && <MealprepSheet recipe={recipe} onClose={() => setCreatingMealprep(false)} />}
    </SlideInPage>
  )
}

/** One saved Mealprep version, collapsed to its target description (e.g. "6 Portionen") until tapped open. */
function MealprepVersionCard({
  version,
  open,
  onToggle,
  onDelete,
}: {
  version: MealprepVersion
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-sm shadow-black/5">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="text-sm font-medium text-ink">{version.targetDescription}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-ink-soft">{Math.round(version.nutrition.kcal)} kcal gesamt</span>
          <ChevronDown open={open} />
        </span>
      </button>
      <Collapse open={open}>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Zutaten</span>
            <div className="flex flex-col gap-1.5">
              {version.ingredients.map((ing, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-ink">{ing.name}</span>
                    {ing.note && <p className="text-xs italic text-ink-soft">{ing.note}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-ink-soft">{formatIngredientAmount(ing)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Zubereitung</span>
            <ol className="flex flex-col gap-1.5">
              {version.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span className="shrink-0 font-semibold text-ink-faint">{i + 1}.</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          </div>

          {version.cookTimeNote && (
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Garzeit</span>
              <p className="text-sm text-ink-soft">{version.cookTimeNote}</p>
            </div>
          )}

          {version.storageNote && (
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Lagerung</span>
              <p className="text-sm text-ink-soft">{version.storageNote}</p>
            </div>
          )}

          <button type="button" onClick={onDelete} className="self-start text-xs font-medium text-danger hover:underline">
            Version löschen
          </button>
        </div>
      </Collapse>
    </div>
  )
}
