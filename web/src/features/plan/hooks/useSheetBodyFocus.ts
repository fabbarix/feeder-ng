// B9-38 (SHORT-02): a sheet that opens on a control of its body (the Leftover portions stepper of Mark as Cooked), not on the
// first button. BottomSheet focuses `focusRef` when it opens; `bodyRef` goes on an element of the body and the ref finds the
// first element matching `selector` in it (none yet: BottomSheet's own default).
import { useMemo, useRef, type RefObject } from 'react'

export function useSheetBodyFocus<T extends HTMLElement>(selector: string): { bodyRef: RefObject<T | null>; focusRef: RefObject<HTMLElement | null> } {
  const bodyRef = useRef<T>(null)
  const focusRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return bodyRef.current?.querySelector<HTMLElement>(selector) ?? null
      },
      set current(_value) {},
    }),
    [selector],
  )
  return { bodyRef, focusRef }
}
