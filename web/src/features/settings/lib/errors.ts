/** A short, human message for an API failure (codes: last_admin, email_taken, user_already_linked,
 *  duplicate_slot, weekday_mismatch, unknown_member, validation_failed, forbidden, network). */
export function errorMessage(_err: unknown): string {
  throw new Error('not implemented')
}
