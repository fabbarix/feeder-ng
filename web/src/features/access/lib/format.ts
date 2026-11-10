// Display text for Access Request values. Plain TypeScript, no React.
import { ApiError } from '../../../lib/http'
import { accessStrings } from '../strings'
import type { AccessEvent } from '../types'
import { elapsedSince } from './requests'

/** "just now", "5 minutes ago", "1 hour ago", "2 days ago". */
export function agoText(iso: string, now: Date): string {
  const e = elapsedSince(iso, now)
  switch (e.unit) {
    case 'now':
      return accessStrings.ago.justNow
    case 'minutes':
      return accessStrings.ago.minutes(e.n)
    case 'hours':
      return accessStrings.ago.hours(e.n)
    case 'days':
      return accessStrings.ago.days(e.n)
  }
}

/** One audit line: "user@x approved zia@x". */
export function historyLine(e: AccessEvent): string {
  const t = accessStrings.historyLine
  switch (e.kind) {
    case 'approved':
      return t.approved(e.actorEmail, e.email)
    case 'denied':
      return t.denied(e.actorEmail, e.email)
    case 'expired':
      return t.expired(e.email)
    default:
      return t.requested(e.email)
  }
}

/** The message for a failed approve or deny: a 404 means somebody else answered first. */
export function answerErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) return accessStrings.alreadyAnswered
  return accessStrings.genericError
}
