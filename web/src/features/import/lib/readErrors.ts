// Read error code -> copy (docs/dev/design/ra-e-import.md section 4.3; plan section 1.4). Plain TypeScript, no React.
import { ApiError } from '../../../lib/http'
import { readStrings as t } from '../strings'
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
  assistant_bad_key: config("The Recipe Assistant's API key was refused.", 'Replace the key in Settings.', 'settings'),
  assistant_forbidden: config("This API key may not use the Recipe Assistant's model.", 'Check the Anthropic workspace.', 'settings'),
  assistant_billing: config('Anthropic reports a billing problem.', 'Check it with Anthropic.', 'settings'),
  assistant_model_unavailable: config('The chosen model is no longer available.', 'Pick another model in Settings.', 'chooseModel'),
  assistant_request_rejected: config('The request was refused.', 'Check the base URL in Settings.', 'settings'),
  assistant_off: config('The Recipe Assistant is off.', 'Turn it on in Settings.', 'settings'),
  photos_not_supported_by_model: config("This model can't read photos.", 'Pick a model that can read photos in Settings.', 'chooseModel'),
  assistant_busy: retry('Anthropic is busy. Try again in a minute.'),
  assistant_unreachable: retry('The Recipe Assistant could not be reached.'),
  network: retry('Feeder could not be reached. Check your connection and try again.'),
  timeout: retry('Feeder could not be reached. Check your connection and try again.'),
  expired: retry('This read was lost, maybe because the server restarted. Try again.'),
  assistant_invalid_output: retry("The Recipe Assistant's answer was not a valid Recipe File."),
  assistant_output_too_long: plain('The recipe was too long to read in one go. Try one recipe at a time.'),
  source_too_long: plain('This recipe is too long to read.'),
  too_many_recipes: plain('There are too many recipes here to read at once. Try one recipe at a time.'),
  no_recipe_found: plain('No recipe was found in this page, text or photo.'),
  page_unavailable: plain('That page could not be opened.', 'Check the address, or paste the recipe text instead.'),
  url_invalid: plain('Enter a web address, like https://example.com/soup.'),
  text_empty: plain('Paste the recipe text first.'),
  text_too_long: plain(t.textTooLong),
  photos_empty: plain('Add at least one photo.'),
  too_many_photos: plain('A read takes up to 4 photos.'),
  photo_too_large: plain('A photo is over 8 MB. Use a smaller picture.'),
  photo_unsupported: plain('A photo could not be read. Use a JPEG, PNG, GIF or WebP picture.'),
  photo_unavailable: plain('A photo link could not be fetched. Add the photo from your device instead.'),
  request_too_large: plain('That is too much to send at once. Use fewer or smaller photos.'),
  read_in_progress: plain('A recipe is already being read. Let it finish, or cancel it.'),
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
        `${error.model ?? 'The model'} declined to read this recipe. Trying another model may work.`,
        o.isAdmin ? undefined : 'Ask an Admin to try another model.',
        o.isAdmin ? 'chooseModel' : 'none',
        false,
      )
    case 'assistant_rate_limited':
      return done(`Too many requests to Anthropic. Try again in ${error.retryAfterSeconds ? waitText(error.retryAfterSeconds) : 'a minute'}.`, undefined, 'retry', true)
    case 'too_many_reads':
      return done(
        `Your Household has read 30 recipes in the last hour. Try again in ${error.retryAfterSeconds ? waitText(error.retryAfterSeconds) : 'a while'}.`,
        undefined,
        'none',
        false,
      )
    case 'assistant_invalid_output':
      return done(FIXED[code]?.message ?? t.genericError, undefined, 'retry', true, (error.errors ?? []).slice(0, MAX_DETAILS).map((e) => `${e.path}: ${e.message}`))
  }
  const entry = FIXED[code]
  if (!entry) return done(t.genericError, undefined, 'retry', true)
  if (entry.config) return o.isAdmin ? done(entry.message, entry.adminHint, entry.adminAction ?? 'none', false) : done(entry.message, t.askAdmin, 'none', false)
  if (entry.retryable) return done(entry.message, undefined, 'retry', true)
  return done(entry.message, entry.adminHint, 'none', false)
}

/** The ApiError of a refused start or a failed poll -> ReadErrorInput (details.retryAfterSeconds / errors / model; status 0 -> 'network' or 'timeout'). */
export function errorFromApi(err: unknown): ReadErrorInput {
  if (!(err instanceof ApiError)) return { code: 'unknown' }
  if (err.status === 0) return { code: err.code === 'timeout' ? 'timeout' : 'network' }
  if (err.status === 404) return { code: 'expired' }
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
