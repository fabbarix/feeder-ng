// Pure helpers for choosing a Member while approving. Plain TypeScript, no React.
import type { AccessMember } from '../types'

/** The Members that have no User yet, in the order given. */
export function unlinkedMembers(members: AccessMember[]): AccessMember[] {
  return members.filter((m) => m.userId === null)
}

/** Stub (test-author step): the Members the approve sheet may offer for a request from `requestEmail`. */
export function linkableMembers(members: AccessMember[], _requestEmail: string): AccessMember[] {
  return unlinkedMembers(members)
}
