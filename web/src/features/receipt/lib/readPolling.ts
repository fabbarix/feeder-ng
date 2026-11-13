// The timing of a receipt read's polls, and the mapping of a refused start or a failed poll to what the copy needs. Plain TypeScript.
import { ApiError } from '../../../lib/http'
import type { ReceiptErrorInput } from '../types'

/** The phone asks every 1.5 s, as the Recipe Assistant's read does. */
export const POLL_INTERVAL_MS = 1500
/** The phone gives up after 150 s; the server cuts a read at 120 s. */
export const POLL_TIMEOUT_MS = 150_000
/** After this many seconds the progress says a long receipt can take a minute. */
export const LONG_READ_AFTER_S = 15

/** The ApiError of a refused start (or of a poll that is not a lost connection) -> ReceiptErrorInput. Status 0 is a lost connection. */
export function failureOf(err: unknown): ReceiptErrorInput {
  if (!(err instanceof ApiError)) return { code: 'unknown' }
  if (err.status === 0) return { code: err.code === 'timeout' ? 'timeout' : 'network' }
  const out: ReceiptErrorInput = { code: err.code }
  const { reason, retryAfterSeconds } = err.details
  if (typeof reason === 'string') out.reason = reason
  if (typeof retryAfterSeconds === 'number') out.retryAfterSeconds = retryAfterSeconds
  return out
}
