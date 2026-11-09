import { Tile } from '../../../ui'
import { signinStrings } from '../strings'
import '../signin.css'
import { GoogleLink } from './GoogleLink'

/** Bento "Not invited" page: explains the allowlist and links "Try another Google account" to /auth/google/login. */
export function NotInvitedPage() {
  return (
    <main className="signin">
      <Tile size="lg" tone="accent" as="section" className="signin__tile">
        <h1 className="signin__title">{signinStrings.notInvitedTitle}</h1>
        <p className="signin__text">{signinStrings.notInvitedText}</p>
        <GoogleLink>{signinStrings.tryAnother}</GoogleLink>
      </Tile>
    </main>
  )
}
