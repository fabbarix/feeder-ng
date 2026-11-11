import { Tile } from '../../../ui'
import { FeederMark } from '../../signin/components/FeederMark'
import { GoogleLink } from '../../signin/components/GoogleLink'
import { accessStrings } from '../strings'
import type { WaitingKind, WaitingStatus } from '../types'
import '../../signin/signin.css'
import '../access.css'

export interface WaitingPageProps {
  kind: WaitingKind
  status?: WaitingStatus
}

const text = accessStrings.waiting

/** The signed-out "Waiting for approval" page. It shows only the visitor's own Google name and email. */
export function WaitingPage({ kind, status }: WaitingPageProps) {
  return (
    <main className="signin">
      <Tile variant="hero" as="section" className="signin__tile">
        <FeederMark />
        <Body kind={kind} status={status} />
      </Tile>
    </main>
  )
}

function Body({ kind, status }: WaitingPageProps) {
  if (kind === 'limited') {
    return (
      <>
        <h1 className="signin__title">{text.limitedTitle}</h1>
        <p role="alert" className="signin__alert">
          {text.limitedText}
        </p>
        <GoogleLink>{text.signIn}</GoogleLink>
      </>
    )
  }
  if (kind === 'full') {
    return (
      <>
        <h1 className="signin__title">{text.fullTitle}</h1>
        <p className="signin__text">{text.fullText}</p>
        <GoogleLink>{text.signIn}</GoogleLink>
      </>
    )
  }
  if (status?.status === 'none') {
    return (
      <>
        <h1 className="signin__title">{text.answeredTitle}</h1>
        <p className="signin__text">{text.answeredText}</p>
        <GoogleLink>{text.signIn}</GoogleLink>
      </>
    )
  }
  return (
    <>
      <h1 className="signin__title">{text.title}</h1>
      <p className="signin__text">{text.text}</p>
      {status?.email ? (
        <div className="access__you">
          <span className="access__you-label">{text.signedInAs}</span>
          {status.name ? <strong className="access__you-name">{status.name}</strong> : null}
          <span>{status.email}</span>
        </div>
      ) : null}
      <GoogleLink>{text.otherAccount}</GoogleLink>
    </>
  )
}
