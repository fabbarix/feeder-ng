// B9-38 (SHORT-02): a sheet that opens on a control of its body (the Leftover portions stepper of Mark as Cooked), not on the
// first button. BottomSheet focuses `focusRef` when it opens; `bodyRef` goes on an element of the body and the ref finds the
// first element matching `selector` in it. When the control only appears once a read has answered (the cook preview), it takes
// the focus then, once per opening.
import { useEffect, useMemo, useRef, type RefObject } from 'react'

export function useSheetBodyFocus<T extends HTMLElement>(selector: string): { bodyRef: RefObject<T | null>; focusRef: RefObject<HTMLElement | null> } {
  const bodyRef = useRef<T>(null)
  const focused = useRef(false)
  const focusRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return bodyRef.current?.querySelector<HTMLElement>(selector) ?? null
      },
      set current(_value) {},
    }),
    [selector],
  )
  useEffect(() => {
    if (!bodyRef.current) {
      focused.current = false // closed: the next opening focuses again
      return
    }
    const target = focusRef.current
    if (!target) return
    if (!focused.current && document.activeElement !== target) target.focus()
    focused.current = true
  })
  return { bodyRef, focusRef }
}
