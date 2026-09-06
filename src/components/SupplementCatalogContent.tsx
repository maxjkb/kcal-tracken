import { useState, type ChangeEvent } from 'react'
import { SUPPLEMENT_CATEGORY_LABELS, type Supplement } from '../lib/db'
import { SUPPLEMENT_CATEGORY_ORDER } from '../lib/supplementSeed'
import { addMySupplement, removeMySupplement, useAllSupplements, useMySupplements } from '../hooks/useSupplements'
import { SupplementFormSheet } from './SupplementFormSheet'
import { GlassSurface } from '../glass/GlassSurface'

/**
 * The full supplement catalog, browsable and searchable.
 *
 * Global brainstorm round (v2.1): used to be its own Sheet, reached via the
 * header's book icon — now one of the Supps page's own tabs (Heute/
 * Vorschläge/Score/Katalog, picked from the same expandable pill as the
 * other three; see SupplementsPage.tsx), rendered inline instead. The
 * search field moved from docked-at-the-sheet's-own-bottom to plain
 * top-of-list: a Sheet has its own dedicated scroll container to dock
 * against, but this now shares the page's ordinary document scroll — right
 * above BottomNav's fixed bar, not a scroll container of its own — so the
 * sticky-bottom trick that worked inside the sheet would dock the field
 * behind the nav instead of above it. A plain field at the top avoids that
 * rather than fighting it; the previous position was a Sheet-specific
 * convenience, not something this content depends on.
 */
export function SupplementCatalogContent() {
  const supplements = useAllSupplements()
  const mySupplements = useMySupplements()
  const [adding, setAdding] = useState<Supplement | null>(null)
  const [addingCustom, setAddingCustom] = useState(false)
  const [query, setQuery] = useState('')

  const myBySupplementId = new Map((mySupplements ?? []).map((m) => [m.supplementId, m]))

  // Matches the description too, not just the name: the catalog is browsed by
  // problem at least as often as by product ("Schlaf", "Gelenke"), and someone
  // who doesn't already know a supplement's name can't search for it.
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? (supplements ?? []).filter(
        // `?? ''` because these are IndexedDB rows: the declared type is not a
        // runtime guarantee, and one row missing a description used to throw
        // here — which happens while the catalog renders, so it took the whole
        // page down rather than just skipping that entry.
        (s) => (s.name ?? '').toLowerCase().includes(needle) || (s.description ?? '').toLowerCase().includes(needle),
      )
    : (supplements ?? [])

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <GlassSurface
          as="input"
          rim={20}
          type="search"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Katalog durchsuchen…"
          aria-label="Katalog durchsuchen"
          className="glass-subtle glass-subtle-themed w-full rounded-2xl py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true">
          <SearchIcon />
        </span>
      </div>

      {supplements === undefined ? (
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">
          Nichts gefunden für „{query.trim()}". Du kannst es unten als eigenes Supp anlegen.
        </p>
      ) : (
        SUPPLEMENT_CATEGORY_ORDER.map((category) => {
          const inCategory = visible.filter((s) => s.category === category)
          if (inCategory.length === 0) return null
          return (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {SUPPLEMENT_CATEGORY_LABELS[category]}
              </h3>
              <GlassSurface rim={22} className="glass-subtle glass-subtle-themed flex flex-col divide-y divide-line/60 overflow-hidden rounded-3xl">
                {inCategory.map((s) => {
                  const mySupplement = myBySupplementId.get(s.id)
                  const already = mySupplement !== undefined
                  return (
                    // Two independent controls, not one — the row used to be a single
                    // <button> that opened the dosage/timing sheet on any tap. Splitting
                    // it lets the +/- toggle add or remove in one tap with sensible
                    // defaults (below), while tapping the name/description still opens
                    // the sheet to actually set a dosage or times of day. A <button>
                    // can't legally nest another <button> anyway (see SlotButton's
                    // comment in SupplementChecklist.tsx for the same constraint).
                    <div key={s.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <button type="button" onClick={() => setAdding(s)} className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-medium text-ink">{s.name}</p>
                        {s.description && <p className="mt-0.5 text-xs text-ink-soft">{s.description}</p>}
                        <p className="mt-0.5 text-xs text-ink-soft">{s.typicalDosage}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          already
                            ? removeMySupplement(mySupplement.id)
                            : addMySupplement({ supplementId: s.id, dosage: s.typicalDosage, timesOfDay: ['morning'] })
                        }
                        aria-label={already ? `${s.name} von der Liste entfernen` : `${s.name} zur Liste hinzufügen`}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                          already ? 'bg-danger/12 text-danger hover:bg-danger/20' : 'bg-accent/12 text-accent hover:bg-accent/20'
                        }`}
                      >
                        {already ? <MinusIcon /> : <PlusIcon />}
                      </button>
                    </div>
                  )
                })}
              </GlassSurface>
            </div>
          )
        })
      )}

      <button
        type="button"
        onClick={() => setAddingCustom(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-medium text-ink-soft hover:bg-bg"
      >
        + Eigenes Supp
      </button>

      {adding && <SupplementFormSheet supplement={adding} onClose={() => setAdding(null)} />}
      {addingCustom && <SupplementFormSheet onClose={() => setAddingCustom(false)} />}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m20 20-3.5-3.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
      <path strokeLinecap="round" d="M5 12h14" />
    </svg>
  )
}
