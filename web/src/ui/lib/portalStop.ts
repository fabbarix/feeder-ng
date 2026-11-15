// B9-14 / DS-01: a modal sheet or dialog is portalled to document.body, but React still bubbles its events through the React tree
// to the component that mounted it (a list row's onClick, a trigger's onKeyDown). The portal root ends that React bubbling.
//
// It does NOT call the native stopPropagation (which React's own stopPropagation does): document and window listeners of the
// controls inside (PriceKeypad's keys, a Menu's Escape, a Select's outside click) must still hear the event.
import type { SyntheticEvent } from 'react'

const stopped = () => true

/** Ends React's bubbling of `e` at this element; the native event carries on. */
export function stopReactPropagation(e: SyntheticEvent): void {
  e.isPropagationStopped = stopped
}

/**
 * A portalled dialog leaves the subtree it was mounted in, and with it a scheme that subtree sets (the Gallery's light and dark
 * panels side by side). `anchor` is a hidden element left in place: the dialog takes the `data-scheme` of the anchor's nearest
 * ancestor that sets one, unless that is the document itself (whose scheme reaches the dialog anyway).
 */
export function inheritScheme(anchor: HTMLElement | null, dialog: HTMLElement | null): void {
  if (!anchor || !dialog) return
  const owner = anchor.parentElement?.closest<HTMLElement>('[data-scheme]')
  if (owner && owner !== document.documentElement) dialog.dataset['scheme'] = owner.dataset['scheme']
}
