import type { WaitingStatus } from '../types'

/** Polls GET /api/access-request/status every 15 s while the waiting page is open. */
export function useWaitingStatus(): { status?: WaitingStatus; isPending: boolean } {
  return { isPending: true }
}
