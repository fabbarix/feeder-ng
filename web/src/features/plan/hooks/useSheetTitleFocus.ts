// B9-26: a sheet that opens on its title (PC-01 Review; the Planned Meal sheet of a Cooked meal, whose only action is an Undo).
// BottomSheet focuses `initialFocusRef` when it opens; its title is its own element, so the ref finds it from a node in the body.
import { useMemo, useRef, type RefObject } from 'react'

/** `bodyRef` goes on an element of the sheet's body; `titleRef` is the BottomSheet's `initialFocusRef`. */
export function useSheetTitleFocus<T extends HTMLElement>(): { bodyRef: RefObject<T | null>; titleRef: RefObject<HTMLElement | null> } {
  const bodyRef = useRef<T>(null)
  const titleRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return bodyRef.current?.closest('dialog')?.querySelector<HTMLElement>('.sheet__title') ?? null
      },
      set current(_value) {},
    }),
    [],
  )
  return { bodyRef, titleRef }
}
