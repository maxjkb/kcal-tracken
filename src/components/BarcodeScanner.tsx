import { useEffect, useRef, useState } from 'react'
import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { DecodeHintType } from '@zxing/library'

const HINTS = new Map([
  // Limited to the retail-barcode formats Open Food Facts actually keys
  // products by — narrower detection is faster and avoids a QR code or a
  // shipping label in frame being mistaken for a product barcode.
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
])

/**
 * Live camera view that keeps scanning until it reads one barcode, then
 * reports it and stops — this is a single-shot control, not a continuous
 * scanning surface; the caller decides what happens after (in MealEditor,
 * closing back to the input step).
 *
 * @zxing/browser rather than the native BarcodeDetector API: BarcodeDetector
 * has no Safari support at all (checked against caniuse — Safari/iOS is
 * this app's primary target per the HIG review), so relying on it would
 * make the whole feature silently unavailable on the one platform that
 * matters most. @zxing/browser decodes frames itself via getUserMedia +
 * canvas, so it works identically everywhere a camera does.
 */
export function BarcodeScanner({
  onDetected,
  onCancel,
}: {
  onDetected: (barcode: string) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Fallback for when the camera won't cooperate — bad lighting, a worn or
  // curved label, or (per the "Scanner funktioniert nicht zuverlässig"
  // report) a camera/decoder combination that just doesn't reliably read on
  // this device. Typing the number printed under the barcode always works,
  // so it stays one tap away rather than only appearing after an error —
  // an unreliable scan often looks like "still trying", not a thrown error.
  const [manualMode, setManualMode] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  useEffect(() => {
    let controls: IScannerControls | null = null
    let cancelled = false
    const reader = new BrowserMultiFormatReader(HINTS)

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        // Fires on every frame, found or not — a miss reports its own
        // NotFoundException, which is the normal case for nearly every
        // frame and not an error worth surfacing.
        if (!result) return
        controls?.stop()
        onDetected(result.getText())
      })
      .then((c) => {
        if (cancelled) {
          c.stop() // Unmounted (cancel tapped) while getUserMedia was still resolving.
          return
        }
        controls = c
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Kein Kamerazugriff erlaubt. In den iOS-Einstellungen unter Safari/dieser App den Kamera-Zugriff erlauben.'
            : name === 'NotFoundError'
              ? 'Keine Kamera gefunden.'
              : 'Kamera konnte nicht gestartet werden.',
        )
      })

    return () => {
      cancelled = true
      controls?.stop()
    }
    // onDetected is passed fresh every render from MealEditor, but it's a
    // stable-enough closure (mealDate/mealType-derived, not per-keystroke)
    // that re-running this effect on every parent render would restart the
    // camera stream for no reason — genuinely mount-once, like any camera view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submitManualCode() {
    // EAN-8/UPC-E through EAN-13/UPC-A/GTIN-14 — the same family HINTS
    // restricts the camera decoder to, so a manually typed code lands in
    // exactly the range Open Food Facts actually expects. Digits only:
    // spaces are common when copying a code off a label, so trimmed and
    // stripped rather than rejected outright.
    const digits = manualCode.replace(/\s+/g, '')
    if (!/^\d{8,14}$/.test(digits)) {
      setManualError('Bitte die 8- bis 14-stellige Zahl unter dem Barcode eingeben.')
      return
    }
    onDetected(digits)
  }

  return (
    <div className="flex flex-col gap-4 p-5 pt-7">
      <h2 className="font-display text-lg font-semibold text-ink">Barcode scannen</h2>

      {error ? (
        <p className="rounded-2xl bg-danger/10 p-4 text-sm text-danger">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-3xl bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a live camera feed, not recorded media */}
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
            <div className="h-full w-full rounded-2xl border-2 border-white/70" />
          </div>
        </div>
      )}

      <p className="text-center text-xs text-ink-soft">
        Produktdaten von{' '}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">
          Open Food Facts
        </a>
      </p>

      {manualMode ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="barcode-manual-input" className="text-xs text-ink-soft">
            Nummer unter dem Barcode
          </label>
          <div className="flex gap-2">
            <input
              id="barcode-manual-input"
              type="text"
              inputMode="numeric"
              autoFocus
              value={manualCode}
              onChange={(e) => {
                setManualCode(e.target.value)
                setManualError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitManualCode()
              }}
              placeholder="z.B. 4008400123456"
              className="field min-w-0 flex-1 rounded-2xl px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={submitManualCode}
              className="shrink-0 rounded-2xl bg-accent/12 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
            >
              Suchen
            </button>
          </div>
          {manualError && <p className="text-xs font-medium text-danger">{manualError}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setManualMode(true)} className="text-center text-xs font-medium text-accent">
          Erkennt die Kamera den Code nicht? Nummer manuell eingeben
        </button>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-2xl bg-bg py-3 text-sm font-medium text-ink-soft hover:bg-line"
      >
        Abbrechen
      </button>
    </div>
  )
}
