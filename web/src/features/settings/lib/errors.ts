import { ApiError } from '../../../lib/http'
import { coursesStrings } from '../coursesStrings'

const MESSAGES: Record<string, string> = {
  last_admin: 'The Household needs at least one Admin.',
  email_taken: 'That email already belongs to a Member, a User or the allowlist.',
  duplicate_slot: 'That weekday already has a Meal Slot with this name and time.',
  weekday_mismatch: 'That date does not fall on the Meal Slot\'s weekday.',
  unknown_member: 'That Member no longer exists.',
  duplicate_attendee: 'A Member is listed twice in the Attendance.',
  forbidden: 'Only an Admin can do that.',
  network: 'Check your connection and try again.',
}

/** CRS D2: the Courses refusals of a Meal Slot save, by `reason`, whatever the server wording. */
const COURSE_REASONS: Record<string, string> = {
  courses_all_optional: coursesStrings.slot.allOptional,
  courses_empty: 'Choose at least one Course',
  course_unknown: 'One of the Courses is no longer in the list.',
}

/** A short, human message for an API failure (codes: last_admin, email_taken, user_already_linked,
 *  duplicate_slot, weekday_mismatch, unknown_member, validation_failed, forbidden, network). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const reason = err.details.reason
    if (err.code === 'validation_failed' && typeof reason === 'string' && Object.hasOwn(COURSE_REASONS, reason)) return COURSE_REASONS[reason]!
    if (err.code === 'validation_failed' || err.code === 'user_already_linked') return err.message
    const known = MESSAGES[err.code]
    if (known) return known
  }
  return 'Something went wrong. Please try again.'
}

/** R15: a refused batch edit shows the server's own sentence (it names the clash), else the usual short message. */
export function batchErrorMessage(err: unknown): string {
  if (err instanceof ApiError && (err.code === 'duplicate_slot' || err.code === 'no_matching_slot') && err.message) return err.message
  return errorMessage(err)
}
