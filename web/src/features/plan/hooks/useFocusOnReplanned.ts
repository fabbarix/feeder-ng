// B9-38 (PC-09): after Undo Cooked or Undo Not cooked the sheet's meal is planned again while the sheet is still open: its Cook
// (or Reheat) takes the focus, so the keyboard lands on the action that is back.
import { useEffect, useRef, type RefObject } from 'react'

export function useFocusOnReplanned(planned: boolean, target: RefObject<HTMLElement | null>): void {
  const was = useRef(planned)
  useEffect(() => {
    if (planned && !was.current) target.current?.focus()
    was.current = planned
  }, [planned, target])
}
