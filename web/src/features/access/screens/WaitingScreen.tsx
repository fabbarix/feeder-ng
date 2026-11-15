import { useDocumentTitle } from '../../../ui/lib/useDocumentTitle'
import { WaitingPage } from '../components/WaitingPage'
import { useWaitingStatus } from '../hooks/useWaitingStatus'
import { accessStrings } from '../strings'
import type { WaitingKind, WaitingStatus } from '../types'

const text = accessStrings.waiting

/** B9-49 (A11Y-01): the document is titled after the page's h1 ("Waiting for approval · Feeder"), as WaitingPage chooses it. */
function waitingTitle(kind: WaitingKind, status: WaitingStatus | undefined): string {
  if (kind === 'limited') return text.limitedTitle
  if (kind === 'full') return text.fullTitle
  if (status?.status === 'none') return text.answeredTitle
  return text.title
}

/** The signed-out waiting route: polls the visitor's own status (only for the waiting state) and shows WaitingPage. */
export function WaitingScreen({ kind }: { kind: WaitingKind }) {
  const { status } = useWaitingStatus(kind === 'waiting')
  useDocumentTitle([waitingTitle(kind, status)])
  return <WaitingPage kind={kind} status={status} />
}
