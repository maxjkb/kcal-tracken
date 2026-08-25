import { useEffect, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts'

/**
 * Rescuing a half-filled sheet form from an accidental close comes in two
 * halves, and they have to sit on opposite sides of the form's own useState
 * calls: the restored values are needed to *seed* that state, while the
 * snapshot to store is *derived* from it. Hence two hooks rather than one —
 * a single hook would have to take the snapshot as an argument and return the
 * restore, which is circular.
 *
 * Sheets no longer have a "✕", so they close on a handle tap or a downward
 * swipe — gestures that are much easier to fire by accident than a button is.
 * Losing several minutes of typing (or a dictated description) to a stray
 * swipe is the case these exist to prevent.
 */

/**
 * Reads any still-fresh draft for `key`, once, on mount. Call before the
 * form's useState calls and seed them from the result.
 *
 * Read in a useState initializer rather than on every render: a draft is a
 * snapshot of the moment the sheet closed, and re-reading it after the caller
 * has already seeded state from it would hand back values the user has since
 * edited past.
 */
export function useRestoredDraft<T>(key: string): T | null {
  return useState(() => loadDraft<T>(key))[0]
}

/**
 * Writes `current` back to the draft store when the sheet unmounts, but only
 * while `isDirty` — merely opening and closing an untouched sheet must not
 * leave a draft behind for the next open to resurrect.
 *
 * Returns two ways to drop the draft, and they are not interchangeable:
 * `clear` after a successful save (the stored record is the truth from then
 * on, and nothing more should be written on unmount), and `discard` for the
 * banner's "Verwerfen" (wipe what was restored, but keep protecting whatever
 * the user types next). Using `clear` for both meant that discarding a
 * restored draft silently switched the rescue off for the rest of the sheet's
 * life — so a full new description typed afterwards was lost to exactly the
 * stray swipe this hook exists to survive.
 *
 * `shrink` is the fallback for a snapshot too large to store (a meal photo's
 * data URL runs to megabytes) — return a slimmed-down copy, so the typing is
 * still rescued even when the photo can't be.
 */
export function useDraftAutosave<T>(
  key: string,
  current: T,
  isDirty: boolean,
  shrink?: (data: T) => T,
): { clear: () => void; discard: () => void } {
  const latest = useRef(current)
  const dirty = useRef(isDirty)
  const shrinkFn = useRef(shrink)
  const saved = useRef(false)

  // Synced in an effect rather than assigned during render: the cleanup below
  // is the only reader and runs after a committed render, so an effect is
  // always early enough — while writing during render would also capture
  // renders React ends up discarding.
  useEffect(() => {
    latest.current = current
    dirty.current = isDirty
    shrinkFn.current = shrink
  })

  useEffect(() => {
    return () => {
      if (saved.current || !dirty.current) return
      if (saveDraft(key, latest.current)) return
      if (shrinkFn.current) saveDraft(key, shrinkFn.current(latest.current))
    }
  }, [key])

  return {
    /** After a successful save: forget the draft and stop autosaving. */
    clear: () => {
      saved.current = true
      clearDraft(key)
    },
    /** After "Verwerfen": forget the draft, but keep autosaving from here on. */
    discard: () => {
      saved.current = false
      clearDraft(key)
    },
  }
}
