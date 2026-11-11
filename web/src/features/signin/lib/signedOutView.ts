import { waitingKind, WAITING_PATH } from '../../access/lib/waitingView'
import type { WaitingKind } from '../../access/types'

/** Where the Google redirect starts. */
export const GOOGLE_LOGIN_PATH = '/auth/google/login'

export type SignedOutView =
  | { view: 'sign-in'; reason?: 'denied' | 'failed' }
  | { view: 'not-invited' }
  | { view: 'waiting'; kind: WaitingKind }

/** Which signed-out page to show: /not-invited, /waiting-for-approval (A1), else the sign-in page (with a reason from ?error=denied|failed). */
export function signedOutView(pathname: string, search: string): SignedOutView {
  if (pathname.replace(/\/+$/, '') === '/not-invited') return { view: 'not-invited' }
  if (pathname.replace(/\/+$/, '') === WAITING_PATH) return { view: 'waiting', kind: waitingKind(search) }
  const error = new URLSearchParams(search).get('error')
  if (error === 'denied' || error === 'failed') return { view: 'sign-in', reason: error }
  return { view: 'sign-in' }
}
