import { Tile } from '../../../ui'
import { signinStrings } from '../strings'
import '../signin.css'
import { FeederMark } from './FeederMark'
import { GoogleLink } from './GoogleLink'

export interface SignInPageProps {
  reason?: 'denied' | 'failed'
}

/** Bento sign-in: heading "Sign in to Feeder", link "Continue with Google" to /auth/google/login, and an alert for a reason. */
export function SignInPage({ reason }: SignInPageProps) {
  return (
    <main className="signin">
      <Tile variant="hero" as="section" className="signin__tile">
        <FeederMark />
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
