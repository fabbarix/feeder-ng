import type { ReactNode } from 'react'
import { GOOGLE_LOGIN_PATH } from '../lib/signedOutView'
import { GoogleG } from './GoogleG'

/** A link to the server-side Google redirect (a navigation, not an XHR), styled as a white outlined Google button. */
export function GoogleLink({ children }: { children: ReactNode }) {
  return (
    <a className="signin__link" data-variant="google" href={GOOGLE_LOGIN_PATH}>
      <GoogleG />
      <span>{children}</span>
    </a>
  )
}
