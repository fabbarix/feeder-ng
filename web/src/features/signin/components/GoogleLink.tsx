import type { ReactNode } from 'react'
import { GOOGLE_LOGIN_PATH } from '../lib/signedOutView'

/** A link to the server-side Google redirect, styled as a primary Button (a navigation, not an XHR). */
export function GoogleLink({ children }: { children: ReactNode }) {
  return (
    <a className="button signin__link" data-variant="primary" data-size="lg" href={GOOGLE_LOGIN_PATH}>
      {children}
    </a>
  )
}
