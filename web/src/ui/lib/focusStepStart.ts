// B9-14 / A11Y-07 "a sheet changes step": focus moves to the new step's heading.
import { useEffect, useRef, type RefObject } from 'react'

/** Focuses the first [data-step-heading], else the first h2 or h3 of `root` (given tabIndex -1). Null when there is none. */
export function focusStepStart(root: ParentNode): HTMLElement | null {
  const heading = root.querySelector<HTMLElement>('[data-step-heading]') ?? root.querySelector<HTMLElement>('h2, h3')
  if (!heading) return null
  if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
  heading.focus()
  return heading
}

/** Calls focusStepStart on the root when `stepKey` changes; never on the first render (opening is useModalDialog's). */
export function useFocusStepStart(rootRef: RefObject<HTMLElement | null>, stepKey: string | number): void {
  const previous = useRef(stepKey)
  useEffect(() => {
    if (previous.current === stepKey) return
    previous.current = stepKey
    if (rootRef.current) focusStepStart(rootRef.current)
  }, [rootRef, stepKey])
}
