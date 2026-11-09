import type { AllowedUser } from '../types'

/** A pragmatic check: something@something.tld without spaces. The server has the last word. */
export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())
}

/** True for the only Admin: they cannot be demoted or removed. */
export function isLastAdmin(users: AllowedUser[], user: AllowedUser): boolean {
  return user.isAdmin && users.filter((u) => u.isAdmin).length === 1
}
