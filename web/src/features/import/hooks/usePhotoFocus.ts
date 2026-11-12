// Where focus goes in the Photo tab (docs/dev/design/photo-read.md section 6): after the editor closes, after a photo is removed. The
// rows are found by their photo id (data-photo-id on the Edit and Remove buttons); the sources by their wrapper.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Photo, PhotoPagesState } from '../lib/photoPages'
import { photoReadStrings as t } from '../strings'

/** A photo's Edit button, else its Remove button (a link or an as-is photo has no Edit). */
function rowControl(root: ParentNode | null, id: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-photo-id="${id}"][data-photo-edit]`) ?? root?.querySelector<HTMLElement>(`[data-photo-id="${id}"][data-photo-remove]`) ?? null
}

/** The first button of the sources (Take photo on a phone, else Choose files). */
function firstSource(sources: HTMLElement | null): void {
  sources?.querySelector<HTMLButtonElement>('button')?.focus()
}

export interface PhotoFocusRefs {
  /** The Photo panel's group. */
  root: RefObject<HTMLElement | null>
  /** The sources' wrapper. */
  sources: RefObject<HTMLElement | null>
  /** The problem message (focused when a refusal appears). */
  alert: RefObject<HTMLElement | null>
}

/**
 * The panel's focus: a refusal's message takes focus; when the editor closes, Use photo or Cancel of a kept photo focuses its Edit button,
 * and a cancelled new photo (now gone) focuses the first source; a Retake leaves focus to the camera (PhotoSources opens it); removing the
 * last photo focuses the first source. Returns `removing()`, to call just before a photo is removed.
 */
export function usePhotoFocus(state: PhotoPagesState, refs: PhotoFocusRefs, retakePending: boolean): { removing: () => void } {
  const shown = useRef(state.editing)
  const removedLast = useRef(false)

  useEffect(() => {
    if (state.problem) refs.alert.current?.focus()
  }, [state.problem, refs.alert])

  useEffect(() => {
    const was = shown.current
    shown.current = state.editing
    if (!was || state.editing || retakePending) return
    if (state.photos.some((p) => p.id === was.id)) rowControl(refs.root.current, was.id)?.focus()
    else firstSource(refs.sources.current)
  }, [state.editing, state.photos, retakePending, refs.root, refs.sources])

  useEffect(() => {
    if (state.photos.length > 0 || !removedLast.current) return
    removedLast.current = false
    firstSource(refs.sources.current)
  }, [state.photos.length, refs.sources])

  return {
    removing: () => {
      removedLast.current = state.photos.length === 1
    },
  }
}

/**
 * The list after a Remove: focus goes to the row now at the removed position (its Edit button, else its Remove button; the last row when
 * the removed one was last), and a polite status says which photo was removed. The status is the caller's to keep mounted.
 */
export function usePhotoListFocus(photos: readonly Photo[], list: RefObject<HTMLElement | null>): { announcement: string; removed: (index: number) => void } {
  const [announcement, setAnnouncement] = useState('')
  const removedAt = useRef<number | null>(null)

  useEffect(() => {
    const at = removedAt.current
    if (at === null) return
    removedAt.current = null
    if (photos.length === 0) return
    const target = photos[Math.min(at, photos.length - 1)]
    if (target) rowControl(list.current, target.id)?.focus()
  }, [photos, list])

  return {
    announcement,
    removed: (index: number) => {
      removedAt.current = index
      setAnnouncement(t.removedAnnouncement(index + 1))
    },
  }
}
