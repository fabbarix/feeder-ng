import type { WaitingKind, WaitingStatus } from '../types'

export interface WaitingPageProps {
  kind: WaitingKind
  status?: WaitingStatus
}

/** The signed-out "Waiting for approval" page. It shows only the visitor's own Google name and email. */
export function WaitingPage(_props: WaitingPageProps) {
  return null
}
