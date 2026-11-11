// Read error code -> copy (docs/dev/design/ra-e-import.md section 4.3; plan section 1.4). Plain TypeScript, no React.
import { ApiError } from '../../../lib/http'
import { readStrings as t } from '../strings'

const e = t.errors
import type { PathError } from '../types'

/** A failed read, a refused start (ApiError) or a local problem, reduced to what the copy needs. */
export interface ReadErrorInput {
  code: string
  message?: string
  retryAfterSeconds?: number
  errors?: PathError[]
  model?: string
}
/** retry: "Try again"; settings: link to /settings/recipe-assistant; chooseModel: link to /settings/recipe-assistant#model; none. */
export type ReadErrorAction = 'retry' | 'settings' | 'chooseModel' | 'none'
export interface ReadErrorCopy {
  message: string
  /** A second line: what to do (Admins) or "Ask an Admin." (Users). */
  hint?: string
  action: ReadErrorAction
  /** True when sending the same input again can work. */
  retryable: boolean
  /** "path: message" lines of assistant_invalid_output, at most 5. */
  details: string[]
}

const MAX_DETAILS = 5

/** 30 -> "30 s", 59 -> "59 s", 60 -> "1 min", 61 -> "2 min" (rounded up). */
export function waitText(seconds: number): string {
  return seconds < 60 ? `${Math.max(Math.ceil(seconds), 1)} s` : `${Math.ceil(seconds / 60)} min`
}

interface Entry {
  message: string
  /** Admin hint and its link; Users get "Ask an Admin." when `config`. */
  adminHint?: string
  userHint?: string
  adminAction?: ReadErrorAction
  retryable?: boolean
  /** A configuration problem: Users are sent to an Admin. */
  config?: boolean
}

const config = (message: string, adminHint: string, adminAction: ReadErrorAction): Entry => ({ message, adminHint, adminAction, config: true })
const plain = (message: string, hint?: string): Entry => ({ message, adminHint: hint, userHint: hint })
const retry = (message: string): Entry => ({ message, retryable: true })

const FIXED: Record<string, Entry> = {
  assistant_bad_key: config(e.assistant_bad_key, e.assistant_bad_key_hint, 'settings'),
  assistant_forbidden: config(e.assistant_forbidden, e.assistant_forbidden_hint, 'settings'),
  assistant_billing: config(e.assistant_billing, e.assistant_billing_hint, 'settings'),
  assistant_model_unavailable: config(e.assistant_model_unavailable, e.assistant_model_unavailable_hint, 'chooseModel'),
  assistant_request_rejected: config(e.assistant_request_rejected, e.assistant_request_rejected_hint, 'settings'),
  assistant_off: config(e.assistant_off, e.assistant_off_hint, 'settings'),
  photos_not_supported_by_model: config(e.photos_not_supported_by_model, e.photos_not_supported_by_model_hint, 'chooseModel'),
  assistant_busy: retry(e.assistant_busy),
  assistant_unreachable: retry(e.assistant_unreachable),
  network: retry(e.network),
  timeout: retry(e.timeout),
  expired: retry(e.expired),
  assistant_invalid_output: retry(e.assistant_invalid_output),
  assistant_output_too_long: plain(e.assistant_output_too_long),
  source_too_long: plain(e.source_too_long),
  too_many_recipes: plain(e.too_many_recipes),
  no_recipe_found: plain(e.no_recipe_found),
  page_unavailable: plain(e.page_unavailable, e.page_unavailable_hint),
  url_invalid: plain(e.url_invalid),
  text_empty: plain(e.text_empty),
  text_too_long: plain(e.text_too_long),
  photos_empty: plain(e.photos_empty),
  too_many_photos: plain(e.too_many_photos),
  photo_too_large: plain(e.photo_too_large),
  photo_unsupported: plain(e.photo_unsupported),
  photo_unavailable: plain(e.photo_unavailable),
  request_too_large: plain(e.request_too_large),
  read_in_progress: plain(e.read_in_progress),
  read_unavailable: plain(e.read_unavailable),
}

/** The words for a failure by code. Never uses the server's text. */
export function readErrorCopy(error: ReadErrorInput, o: { isAdmin: boolean }): ReadErrorCopy {
  const { code } = error
  const done = (message: string, hint: string | undefined, action: ReadErrorAction, retryable: boolean, details: string[] = []): ReadErrorCopy => ({
    message,
    ...(hint !== undefined ? { hint } : {}),
    action,
    retryable,
    details,
  })
  switch (code) {
    case 'assistant_declined':
      return done(
        e.declined(error.model ?? e.declinedModel),
        o.isAdmin ? undefined : e.declinedUser,
        o.isAdmin ? 'chooseModel' : 'none',
        false,
      )
    case 'assistant_rate_limited':
      return done(e.rateLimited(error.retryAfterSeconds ? waitText(error.retryAfterSeconds) : e.rateLimitedFallback), undefined, 'retry', true)
    case 'too_many_reads':
      return done(
        e.tooManyReads(error.retryAfterSeconds ? waitText(error.retryAfterSeconds) : e.tooManyReadsFallback),
        undefined,
        'none',
        false,
      )
    case 'assistant_invalid_output':
      return done(FIXED[code]?.message ?? t.genericError, undefined, 'retry', true, (error.errors ?? []).slice(0, MAX_DETAILS).map((d) => `${d.path}: ${d.message}`))
  }
  const entry = FIXED[code]
  if (!entry) return done(t.genericError, undefined, 'retry', true)
  if (entry.config) return o.isAdmin ? done(entry.message, entry.adminHint, entry.adminAction ?? 'none', false) : done(entry.message, t.askAdmin, 'none', false)
  if (entry.retryable) return done(entry.message, undefined, 'retry', true)
  return done(entry.message, entry.adminHint, 'none', false)
}

/** The ApiError of a refused start (`during` 'start') or a failed poll -> ReadErrorInput (details.retryAfterSeconds / errors / model; status 0 -> 'network' or 'timeout'). */
export function errorFromApi(err: unknown, during: 'start' | 'poll' = 'poll'): ReadErrorInput {
  if (!(err instanceof ApiError)) return { code: 'unknown' }
  if (err.status === 0) return { code: err.code === 'timeout' ? 'timeout' : 'network' }
  // On a poll a 404 means the read was lost; on the start POST nothing was lost, the endpoint is not there.
  if (err.status === 404) return { code: during === 'start' ? 'read_unavailable' : 'expired' }
  const out: ReadErrorInput = { code: err.code }
  const { retryAfterSeconds, errors, model } = err.details
  if (typeof retryAfterSeconds === 'number') out.retryAfterSeconds = retryAfterSeconds
  if (Array.isArray(errors)) out.errors = errors as PathError[]
  if (typeof model === 'string') out.model = model
  return out
}

/**
 * The server names the model that declined by its id; the copy wants the display name. When the id is the one the status
 * reports, use the status's name (ra-e-import.md A2).
 */
export function withModelName(error: ReadErrorInput, model: { id?: string; name?: string }): ReadErrorInput {
  if (error.code !== 'assistant_declined' || !model.name) return error
  if (error.model === undefined || error.model === model.id) return { ...error, model: model.name }
  return error
}
