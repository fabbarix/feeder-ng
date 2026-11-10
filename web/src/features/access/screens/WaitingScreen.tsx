import { WaitingPage } from '../components/WaitingPage'
import { useWaitingStatus } from '../hooks/useWaitingStatus'
import type { WaitingKind } from '../types'

/** The signed-out waiting route: polls the visitor's own status (only for the waiting state) and shows WaitingPage. */
export function WaitingScreen({ kind }: { kind: WaitingKind }) {
  const { status } = useWaitingStatus(kind === 'waiting')
  return <WaitingPage kind={kind} status={status} />
}
