// Display text for Access Request values. Plain TypeScript, no React.
import { actionFailed, failureLine } from '../../../lib/errorCopy'
import { ApiError } from '../../../lib/http'
import { accessStrings } from '../strings'
import type { AccessEvent } from '../types'

/** "just now", "5 minutes ago", "1 hour ago", "2 days ago" (it lives with requestWhen, which uses it). */
export { agoText } from './requests'

/** One audit line: "user@x approved zia@x". */
export function historyLine(e: AccessEvent): string {
  const t = accessStrings.historyLine
  switch (e.kind) {
    case 'approved':
      return e.memberName ? t.approvedAndLinked(e.actorEmail, e.email, e.memberName) : t.approved(e.actorEmail, e.email)
    case 'denied':
      return t.denied(e.actorEmail, e.email)
    case 'expired':
      return t.expired(e.email)
    default:
      return t.requested(e.email)
  }
}

/**
 * The message for a failed approve or deny: a 404 means somebody else answered first. Otherwise it names what failed
 * (`phrase`, from accessStrings.failed) and what to do (B9-20, RES-06: lib/errorCopy).
 */
export function answerErrorMessage(err: unknown, phrase: string): string {
  if (err instanceof ApiError && err.status === 404) return accessStrings.alreadyAnswered
  if (err instanceof ApiError && err.status === 409 && err.code === 'member_unavailable') return accessStrings.memberTaken
  return failureLine(actionFailed(phrase, err))
}
