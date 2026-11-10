import { Tile } from '../../../ui'
import { signinStrings } from '../strings'
import '../signin.css'
import { FeederMark } from './FeederMark'
import { GoogleLink } from './GoogleLink'

/** Bento "Not invited" page: explains the allowlist and links "Use a different Google sign-in" to /auth/google/login. */
export function NotInvitedPage() {
  return (
    <main className="signin">
      <Tile variant="hero" as="section" className="signin__tile">
        <FeederMark />
        <h1 className="signin__title">{signinStrings.notInvitedTitle}</h1>
        <p className="signin__text">{signinStrings.notInvitedText}</p>
        <GoogleLink>{signinStrings.tryAnother}</GoogleLink>
      </Tile>
    </main>
  )
}
