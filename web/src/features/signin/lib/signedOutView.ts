/** Where the Google redirect starts. */
export const GOOGLE_LOGIN_PATH = '/auth/google/login'

export type SignedOutView =
  | { view: 'sign-in'; reason?: 'denied' | 'failed' }
  | { view: 'not-invited' }

/** Which signed-out page to show: /not-invited, else the sign-in page (with a reason from ?error=denied|failed). */
export function signedOutView(_pathname: string, _search: string): SignedOutView {
  throw new Error('not implemented')
}
