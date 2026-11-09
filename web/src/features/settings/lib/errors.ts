import { ApiError } from '../../../lib/http'

const MESSAGES: Record<string, string> = {
  last_admin: 'The Household needs at least one Admin.',
  email_taken: 'That email is already on the allowlist.',
  user_already_linked: 'That User is already linked to another Member.',
  duplicate_slot: 'That weekday already has a Meal Slot with this name and time.',
  weekday_mismatch: 'That date does not fall on the Meal Slot\'s weekday.',
  unknown_member: 'That Member no longer exists.',
  duplicate_attendee: 'A Member is listed twice in the Attendance.',
  forbidden: 'Only an Admin can do that.',
  network: 'Check your connection and try again.',
}

/** A short, human message for an API failure (codes: last_admin, email_taken, user_already_linked,
 *  duplicate_slot, weekday_mismatch, unknown_member, validation_failed, forbidden, network). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'validation_failed') return err.message
    const known = MESSAGES[err.code]
    if (known) return known
  }
  return 'Something went wrong. Please try again.'
}
