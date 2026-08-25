/**
 * Shown at the top of an editor sheet that just restored an unsaved draft.
 *
 * Restoring silently would be its own kind of confusion — reopening "add meal"
 * and finding it pre-filled reads as a bug unless something says why. So the
 * values come back automatically (that's the whole point: carry on where you
 * left off), and this explains it and offers the one-tap way out for the case
 * where the close was deliberate after all.
 */
export function DraftRestoredBanner({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-section-12 px-3 py-2">
      <p className="text-xs text-ink-soft">Nicht gespeicherter Entwurf wiederhergestellt.</p>
      <button
        type="button"
        onClick={onDiscard}
        className="shrink-0 text-xs font-semibold text-section underline-offset-2 hover:underline"
      >
        Verwerfen
      </button>
    </div>
  )
}
