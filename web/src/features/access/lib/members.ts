// Pure helpers for choosing a Member while approving. Plain TypeScript, no React.
import type { AccessMember } from '../types'

/** The Members that have no User yet, in the order given. */
export function unlinkedMembers(members: AccessMember[]): AccessMember[] {
  return members.filter((m) => m.userId === null)
}

const norm = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

/** The Members the approve sheet may offer for a request from `requestEmail`: no User yet, and either no email of their
 *  own or this very email (any letter case). A Member with another email would be linked to a Google account that is not theirs. */
export function linkableMembers(members: AccessMember[], requestEmail: string): AccessMember[] {
  const wanted = norm(requestEmail)
  return unlinkedMembers(members).filter((m) => norm(m.email) === '' || norm(m.email) === wanted)
}
