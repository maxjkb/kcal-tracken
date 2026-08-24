import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { BodyProfileSection } from '../../components/BodyProfileSection'
import { useSavedToast } from '../../hooks/useSavedToast'

export function BodyProfilePage() {
  const { message, flash } = useSavedToast()

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Körperwerte & Ziele" />
      <BodyProfileSection onSaved={() => flash('Körperwerte gespeichert.')} />
      <SavedToast message={message} />
    </div>
  )
}
