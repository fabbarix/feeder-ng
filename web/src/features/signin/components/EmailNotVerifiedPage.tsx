import { Tile } from '../../../ui'
import { signinStrings } from '../strings'
import '../signin.css'
import { FeederMark } from './FeederMark'
import { GoogleLink } from './GoogleLink'

/** Bento "Email not verified" page: says Google has not verified the email and links "Use a different Google sign-in" to /auth/google/login. */
export function EmailNotVerifiedPage() {
  return (
    <main className="signin">
      <Tile variant="hero" as="section" className="signin__tile">
        <FeederMark />
        <h1 className="signin__title">{signinStrings.emailNotVerifiedTitle}</h1>
        <p className="signin__text">{signinStrings.emailNotVerifiedText}</p>
        <GoogleLink>{signinStrings.tryAnother}</GoogleLink>
      </Tile>
    </main>
  )
}
