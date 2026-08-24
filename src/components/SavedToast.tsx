/** Floating confirmation pill, shared by every settings sub-page (paired with useSavedToast). */
export function SavedToast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="glass fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-medium text-ink">
      {message}
    </p>
  )
}
