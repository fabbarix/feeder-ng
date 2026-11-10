import type { WaitingKind } from '../types'

/** The path of the waiting page. */
export const WAITING_PATH = '/waiting-for-approval'

/** Which message the waiting page shows, from its query string (?state=limited|full); anything else is 'waiting'. */
export function waitingKind(search: string): WaitingKind {
  const state = new URLSearchParams(search).get('state')
  return state === 'limited' || state === 'full' ? state : 'waiting'
}
