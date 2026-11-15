import { Tile } from '../../../ui'
import { useEffect } from 'react'
import { signinStrings } from '../strings'
import '../signin.css'
import { FeederMark } from './FeederMark'
import { GoogleLink } from './GoogleLink'

export interface SignInPageProps {
  reason?: 'denied' | 'failed'
}

/** Bento sign-in: heading "Sign in to Feeder", link "Continue with Google" to /auth/google/login, and an alert for a reason. */
export function SignInPage({ reason }: SignInPageProps) {
  // A11Y-01: the one title that does not end " · Feeder": it already names the app.
  useSignInTitle()
  return (
    <main className="signin">
      <Tile variant="hero" as="section" className="signin__tile">
        <FeederMark decorative />
        <h1 className="signin__title">{signinStrings.title}</h1>
        <p className="signin__text">{signinStrings.intro}</p>
        {reason ? (
          <p role="alert" className="signin__alert">
            {signinStrings[reason]}
          </p>
        ) : null}
        <GoogleLink>{signinStrings.continueWithGoogle}</GoogleLink>
      </Tile>
    </main>
  )
}

/** "Sign in to Feeder" (the heading itself, which already names the app). */
function useSignInTitle(): void {
  useEffect(() => {
    document.title = signinStrings.title
  }, [])
}
