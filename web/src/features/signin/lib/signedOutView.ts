import { waitingKind, WAITING_PATH } from '../../access/lib/waitingView'
import type { WaitingKind } from '../../access/types'

/** Where the Google redirect starts. */
export const GOOGLE_LOGIN_PATH = '/auth/google/login'

/** The page for a Google email that Google has not verified. */
const EMAIL_NOT_VERIFIED_PATH = '/email-not-verified'

export type SignedOutView =
  | { view: 'sign-in'; reason?: 'denied' | 'failed' }
  | { view: 'email-not-verified' }
  | { view: 'redirect'; to: string }
  | { view: 'waiting'; kind: WaitingKind }

/** Which signed-out page to show: /email-not-verified, /waiting-for-approval (A1), a redirect from the old /not-invited, else the sign-in page (with a reason from ?error=denied|failed). */
export function signedOutView(pathname: string, search: string): SignedOutView {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/not-invited') return { view: 'redirect', to: '/email-not-verified' }
  if (path === EMAIL_NOT_VERIFIED_PATH) return { view: 'email-not-verified' }
  if (path === WAITING_PATH) return { view: 'waiting', kind: waitingKind(search) }
  const error = new URLSearchParams(search).get('error')
  if (error === 'denied' || error === 'failed') return { view: 'sign-in', reason: error }
  return { view: 'sign-in' }
}
