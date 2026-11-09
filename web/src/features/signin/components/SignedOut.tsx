import { useLocation } from 'react-router-dom'
import { signedOutView } from '../lib/signedOutView'
import { NotInvitedPage } from './NotInvitedPage'
import { SignInPage } from './SignInPage'

/** The signed-out gate: picks SignInPage or NotInvitedPage from the current location. */
export function SignedOut() {
  const { pathname, search } = useLocation()
  const view = signedOutView(pathname, search)
  return view.view === 'not-invited' ? <NotInvitedPage /> : <SignInPage reason={view.reason} />
}
