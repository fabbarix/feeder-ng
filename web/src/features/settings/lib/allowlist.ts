import { settingsAllowlistStrings } from '../strings/allowlist'
import type { AllowedUser } from '../types'

const msg = settingsAllowlistStrings.allowlistPanel.message

/** A pragmatic check: something@something.tld without spaces. The server has the last word. */
export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())
}

/** True for the only Admin: they cannot be demoted or removed. */
export function isLastAdmin(users: AllowedUser[], user: AllowedUser): boolean {
  return user.isAdmin && users.filter((u) => u.isAdmin).length === 1
}

/** The message an Admin sends after adding an email: where to go and what to choose. `origin` is window.location.origin. */
export function signInMessage(email: string, origin: string): string {
  return `${msg.lead}\n${msg.open(origin, email)}`
}

/** The share-sheet payload for the same message; the link goes in `url`, since many share targets append it themselves. */
export function sharePayload(email: string, origin: string): { title: string; text: string; url: string } {
  return {
    title: msg.shareTitle,
    text: `${msg.lead} ${msg.choose(email)}`,
    url: origin,
  }
}

/** An address in the pieces it may wrap between: before the "@" and after each "." (shared with the Sign-in requests). */
export { emailBreak } from '../../access/lib/textBreaks'
