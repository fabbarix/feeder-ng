// B9-31 (SAFE-10, A11Y rule): where focus goes after a removal in the Recipe editor, and after its Undo. It runs once the change
// is on screen (after the commit that removed or restored the row). A removed Step: the Step that took its place (its "Step actions"),
// else the previous one, else "Add Step". A line: the next line's actions button, else the previous one's, else "Add ingredient".
// A use: the next use's remove button in its Step, else the previous one's, else that Step's "Add ingredient use". Undo: the row back.
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { recipeStrings } from '../strings'

export type RemovalFocus =
  | { kind: 'step'; index: number }
  | { kind: 'line'; index: number }
  | { kind: 'use'; stepKey: string; index: number }

const nameOf = (b: HTMLElement) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()
const buttons = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>('button'))
const named = (root: ParentNode | null | undefined, test: (name: string) => boolean) => (root ? buttons(root).find((b) => test(nameOf(b))) : undefined)
const near = <T,>(list: T[], index: number): T | undefined => list[Math.min(index, list.length - 1)]

function targetOf(root: HTMLElement, want: RemovalFocus): HTMLElement | undefined {
  if (want.kind === 'step') {
    const card = near(Array.from(root.querySelectorAll<HTMLElement>('li.step-card')), want.index)
    return card ? named(card, (n) => n === recipeStrings.steps.actions) : named(root, (n) => n === recipeStrings.steps.add)
  }
  if (want.kind === 'line') {
    const row = near(Array.from(root.querySelectorAll<HTMLElement>('.recipe-editor__lines > li')), want.index)
    const actions = recipeStrings.lines.actions('')
    return row ? named(row, (n) => n.startsWith(actions)) : named(root, (n) => n === recipeStrings.lines.add)
  }
  const card = Array.from(root.querySelectorAll<HTMLElement>('li.step-card')).find((c) => c.dataset.focusKey === want.stepKey)
  if (!card) return undefined
  const use = near(Array.from(card.querySelectorAll<HTMLElement>('[data-use]')), want.index) // B9-37: each use is a chip with its remove
  return use ? named(use, (n) => n === recipeStrings.steps.removeUse) : named(card, (n) => n === recipeStrings.steps.addUse)
}

/** Returns `focusAfter(want)`: call it in the same event as the change; focus moves once the change has rendered. */
export function useRemovalFocus(rootRef: RefObject<HTMLElement | null>): (want: RemovalFocus) => void {
  const [request, setRequest] = useState<{ want: RemovalFocus } | null>(null)
  useEffect(() => {
    if (!request || !rootRef.current) return
    targetOf(rootRef.current, request.want)?.focus()
    setRequest(null)
  }, [request, rootRef])
  return useCallback((want: RemovalFocus) => setRequest({ want }), [])
}
