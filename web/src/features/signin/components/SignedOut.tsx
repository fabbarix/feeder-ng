import { Navigate, useLocation } from 'react-router-dom'
import { WaitingScreen } from '../../access/screens/WaitingScreen'
import { signedOutView } from '../lib/signedOutView'
import { EmailNotVerifiedPage } from './EmailNotVerifiedPage'
import { SignInPage } from './SignInPage'

/** The signed-out gate: picks SignInPage, EmailNotVerifiedPage or the waiting page from the current location. */
export function SignedOut() {
  const { pathname, search } = useLocation()
  const view = signedOutView(pathname, search)
  if (view.view === 'redirect') return <Navigate to={view.to} replace />
  if (view.view === 'waiting') return <WaitingScreen kind={view.kind} />
  return view.view === 'email-not-verified' ? <EmailNotVerifiedPage /> : <SignInPage reason={view.reason} />
}
