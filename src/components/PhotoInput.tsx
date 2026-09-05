import { useRef } from 'react'
import { ActionButton } from './ActionButton'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Downscales large photos client-side so IndexedDB storage / API payloads stay small. */
async function downscaleImage(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      // Re-encoded even when no scaling is needed. Returning the original
      // untouched meant a 900x900 PNG screenshot went into storage at its full
      // few megabytes: Firestore rejects any document over 1 MiB, that
      // rejection is swallowed by the fire-and-forget push, and the oversized
      // meal then sits in every later reconcile batch and takes the whole sync
      // down with it. Dimensions alone say nothing about weight; the JPEG pass
      // is what bounds it.
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const encoded = canvas.toDataURL('image/jpeg', 0.85)
      // Keep whichever is actually smaller — for an already-small JPEG the
      // re-encode can come out slightly larger.
      resolve(encoded.length < dataUrl.length ? encoded : dataUrl)
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/** How many photos one meal can carry — generous for "a dish plus its packaging label", not meant as a real gallery. */
export const MAX_MEAL_PHOTOS = 5

/**
 * The camera as a single round action, input and all.
 *
 * Renders its own trigger rather than handing one back through a render prop:
 * a render prop would mean passing a ref-reading callback out during render,
 * and this keeps the ref's only reader inside the event handler where it
 * belongs.
 *
 * Always adds rather than replaces: with multiple photos per meal, "take
 * another one" and "replace the one I have" are different actions, and this
 * button is only ever the former now — removing a specific photo is the
 * gallery's own per-thumbnail control (see PhotoGallery below).
 */
export function PhotoActionButton({
  count,
  onAdd,
  source = 'camera',
}: {
  /** How many photos this meal already has — drives the "active" look and the at-limit disabled state, nothing else. */
  count: number
  onAdd: (dataUrl: string) => void
  /** `camera` opens the camera directly; `library` opens the photo picker. */
  source?: 'camera' | 'library'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const atLimit = count >= MAX_MEAL_PHOTOS

  async function handleFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    // Reset first, and unconditionally: the input keeps its value, so picking
    // the same file again is not a change and fires no event at all.
    input.value = ''
    if (!file) return
    const raw = await readAsDataUrl(file)
    const scaled = await downscaleImage(raw)
    onAdd(scaled)
  }

  const isCamera = source === 'camera'

  return (
    <>
      <ActionButton
        label={
          atLimit
            ? `Maximal ${MAX_MEAL_PHOTOS} Fotos`
            : isCamera
              ? 'Foto aufnehmen'
              : 'Foto aus der Galerie wählen'
        }
        active={count > 0}
        disabled={atLimit}
        onClick={() => inputRef.current?.click()}
      >
        {isCamera ? <CameraIcon /> : <LibraryIcon />}
      </ActionButton>
      {/* `capture` is what separates the two: with it the camera opens
          directly, without it the system photo picker does. Same input, same
          handling — only the entry point differs, which is why a picture you
          already took needed its own button rather than a detour through the
          camera. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        {...(isCamera ? { capture: 'environment' as const } : {})}
        className="hidden"
        onChange={(e) => void handleFile(e.target)}
      />
    </>
  )
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L15 16m0 0 2-2a2 2 0 0 1 2.8 0L21 15.5" />
    </svg>
  )
}

/**
 * The taken photo(s) with a per-photo remove control — rendered by callers
 * that show the picker elsewhere. A single photo keeps the previous
 * full-width, taller treatment (this is overwhelmingly the common case);
 * more than one becomes a horizontal-scroll strip of smaller tiles, each
 * individually removable, rather than shrinking to fit a grid.
 */
export function PhotoGallery({ photos, onRemove }: { photos: string[]; onRemove: (index: number) => void }) {
  if (photos.length === 1) {
    return (
      <div className="relative w-full">
        <img src={photos[0]} alt="Foto der Mahlzeit" className="h-40 w-full rounded-2xl object-cover" />
        <button
          type="button"
          onClick={() => onRemove(0)}
          className="absolute right-2 top-2 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white"
        >
          Entfernen
        </button>
      </div>
    )
  }
  return (
    <div className="flex w-full gap-2 overflow-x-auto pb-0.5">
      {photos.map((photo, i) => (
        <div key={i} className="relative h-28 w-28 shrink-0">
          <img src={photo} alt={`Foto ${i + 1} der Mahlzeit`} className="h-28 w-28 rounded-2xl object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Foto ${i + 1} entfernen`}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white"
          >
            <RemoveIcon />
          </button>
        </div>
      ))}
    </div>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
