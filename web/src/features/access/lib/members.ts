// Pure helpers for choosing a Member while approving. Plain TypeScript, no React.
import type { AccessMember } from '../types'

/** The Members that have no User yet, in the order given. */
export function unlinkedMembers(members: AccessMember[]): AccessMember[] {
  return members.filter((m) => m.userId === null)
}
