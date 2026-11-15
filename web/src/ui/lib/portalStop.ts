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
