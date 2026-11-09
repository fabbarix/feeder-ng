/** Where the Google redirect starts. */
export const GOOGLE_LOGIN_PATH = '/auth/google/login'

export type SignedOutView =
  | { view: 'sign-in'; reason?: 'denied' | 'failed' }
  | { view: 'not-invited' }

/** Which signed-out page to show: /not-invited, else the sign-in page (with a reason from ?error=denied|failed). */
export function signedOutView(pathname: string, search: string): SignedOutView {
  if (pathname.replace(/\/+$/, '') === '/not-invited') return { view: 'not-invited' }
  const error = new URLSearchParams(search).get('error')
  if (error === 'denied' || error === 'failed') return { view: 'sign-in', reason: error }
  return { view: 'sign-in' }
}
