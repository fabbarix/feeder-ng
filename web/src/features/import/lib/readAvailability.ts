// Whether "Read a recipe" can be used, and what to say when it cannot (docs/dev/design/ra-e-import.md section 4.4). Plain TypeScript.
import type { AssistantStatus } from '../types'

export interface ReadAvailability {
  /** The status has not arrived yet (no message, inputs shown disabled). */
  loading: boolean
  /** The Read button and the inputs can be used. */
  enabled: boolean
  isAdmin: boolean
  /** The status call itself failed: offer "Check again". */
  statusFailed: boolean
  /** Why not (when !enabled and !loading). */
  message?: string
  /** Admins: show "Open Recipe Assistant settings". */
  settingsLink: boolean
  /** The Photo option can be chosen. */
  photos: boolean
  photosMessage?: string
  /** The Household limit is used up (non-Admins): Read is disabled and this says when to try again. */
  limitMessage?: string
  /** "N reads left this hour." when 5 or fewer are left. */
  limitHint?: string
  modelName?: string
}

export function availabilityOf(status: AssistantStatus | undefined, o: { isAdmin: boolean; failed?: boolean }): ReadAvailability {
  void status
  void o
  throw new Error('TODO(ra-e developer): not implemented')
}
