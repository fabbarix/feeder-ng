import { useLocation } from 'react-router-dom'
import { WaitingScreen } from '../../access/screens/WaitingScreen'
import { signedOutView } from '../lib/signedOutView'
import { NotInvitedPage } from './NotInvitedPage'
import { SignInPage } from './SignInPage'

/** The signed-out gate: picks SignInPage, NotInvitedPage or the waiting page from the current location. */
export function SignedOut() {
  const { pathname, search } = useLocation()
  const view = signedOutView(pathname, search)
  if (view.view === 'waiting') return <WaitingScreen kind={view.kind} />
  return view.view === 'not-invited' ? <NotInvitedPage /> : <SignInPage reason={view.reason} />
}
