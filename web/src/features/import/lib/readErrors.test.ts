// WP-E/G: read error code -> copy, for Users and Admins (ai-recipe-import.md section 1.4; ra-e-import.md section 4.3).
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { errorFromApi, readErrorCopy, waitText } from './readErrors'

const admin = { isAdmin: true }
const user = { isAdmin: false }

describe('waitText', () => {
  it.each([[1, '1 s'], [30, '30 s'], [59, '59 s'], [60, '1 min'], [61, '2 min'], [600, '10 min'], [601, '11 min']])('%d s -> %s', (s, text) => expect(waitText(s)).toBe(text))
})

describe('configuration errors: Admins get the fix, Users get "Ask an Admin."', () => {
  it.each([
    ['assistant_bad_key', "The Recipe Assistant's API key was refused.", 'Replace the key in Settings.', 'settings'],
    ['assistant_forbidden', "This API key may not use the Recipe Assistant's model.", 'Check the Anthropic workspace.', 'settings'],
    ['assistant_billing', 'Anthropic reports a billing problem.', 'Check it with Anthropic.', 'settings'],
    ['assistant_model_unavailable', 'The chosen model is no longer available.', 'Pick another model in Settings.', 'chooseModel'],
    ['assistant_request_rejected', 'The request was refused.', 'Check the base URL in Settings.', 'settings'],
  ] as const)('%s', (code, message, adminHint, adminAction) => {
    const a = readErrorCopy({ code }, admin)
    expect(a).toMatchObject({ message, hint: adminHint, action: adminAction, retryable: false })
    const u = readErrorCopy({ code }, user)
    expect(u).toMatchObject({ message, hint: 'Ask an Admin.', action: 'none', retryable: false })
  })
})

describe('refusal (assistant_declined): says which model and suggests another', () => {
  it('Admin: names the model and offers "Choose another model"', () => {
    expect(readErrorCopy({ code: 'assistant_declined', model: 'Claude Haiku 5.5' }, admin)).toMatchObject({
      message: 'Claude Haiku 5.5 declined to read this recipe. Trying another model may work.',
      action: 'chooseModel',
      retryable: false, // no automatic retry or fallback, and the same model would decline again
    })
  })
  it('User: names the model and says to ask an Admin to try another model', () => {
    expect(readErrorCopy({ code: 'assistant_declined', model: 'Claude Haiku 5.5' }, user)).toMatchObject({
      message: 'Claude Haiku 5.5 declined to read this recipe. Trying another model may work.',
      hint: 'Ask an Admin to try another model.',
      action: 'none',
    })
  })
  it('without a model name it says "The model"', () => {
    expect(readErrorCopy({ code: 'assistant_declined' }, user).message).toBe('The model declined to read this recipe. Trying another model may work.')
  })
})

describe('transient errors can be retried', () => {
  it('rate limited: "Try again in N s" from retryAfterSeconds', () => {
    expect(readErrorCopy({ code: 'assistant_rate_limited', retryAfterSeconds: 30 }, user)).toMatchObject({ message: 'Too many requests to Anthropic. Try again in 30 s.', action: 'retry', retryable: true })
    expect(readErrorCopy({ code: 'assistant_rate_limited', retryAfterSeconds: 600 }, user).message).toBe('Too many requests to Anthropic. Try again in 10 min.')
  })
  it('rate limited without a time: "Try again in a minute."', () => {
    expect(readErrorCopy({ code: 'assistant_rate_limited' }, user).message).toBe('Too many requests to Anthropic. Try again in a minute.')
  })
  it.each([
    ['assistant_busy', 'Anthropic is busy. Try again in a minute.'],
    ['assistant_unreachable', 'The Recipe Assistant could not be reached.'],
    ['network', 'Feeder could not be reached. Check your connection and try again.'],
    ['timeout', 'Feeder could not be reached. Check your connection and try again.'],
    ['expired', 'This read was lost, maybe because the server restarted. Try again.'],
  ])('%s', (code, message) => {
    for (const who of [admin, user]) expect(readErrorCopy({ code }, who)).toMatchObject({ message, action: 'retry', retryable: true })
  })
})

describe('result errors', () => {
  it('invalid output: retryable, lists at most 5 paths as "path: message"', () => {
    const errors = Array.from({ length: 7 }, (_, i) => ({ path: `$.recipes[0].steps[${i}]`, message: 'required' }))
    const c = readErrorCopy({ code: 'assistant_invalid_output', errors }, user)
    expect(c).toMatchObject({ message: "The Recipe Assistant's answer was not a valid Recipe File.", action: 'retry', retryable: true })
    expect(c.details).toHaveLength(5)
    expect(c.details[0]).toBe('$.recipes[0].steps[0]: required')
  })
  it('no details for other errors', () => {
    expect(readErrorCopy({ code: 'assistant_busy' }, user).details).toEqual([])
  })
  it('output too long: one recipe at a time, not retryable as is', () => {
    expect(readErrorCopy({ code: 'assistant_output_too_long' }, user)).toMatchObject({ message: 'The recipe was too long to read in one go. Try one recipe at a time.', retryable: false, action: 'none' })
  })
  it('source too long', () => {
    expect(readErrorCopy({ code: 'source_too_long' }, user)).toMatchObject({ message: 'This recipe is too long to read.', retryable: false })
  })
  it('no recipe found', () => {
    expect(readErrorCopy({ code: 'no_recipe_found' }, user)).toMatchObject({ message: 'No recipe was found in this page, text or photo.', retryable: false })
  })
  it('page unavailable is generic (no reason is revealed) and suggests pasting the text', () => {
    expect(readErrorCopy({ code: 'page_unavailable' }, user)).toMatchObject({ message: 'That page could not be opened.', hint: 'Check the address, or paste the recipe text instead.' })
  })
})

describe('input errors (start refused with 4xx)', () => {
  it.each([
    ['url_invalid', 'Enter a web address, for example https://example.com/soup.'],
    ['text_empty', 'Paste the recipe text first.'],
    ['text_too_long', 'That text is over 50,000 characters. Paste a shorter part.'],
    ['photos_empty', 'Add at least one photo.'],
    ['too_many_photos', 'A read takes up to 4 photos.'],
    ['photo_too_large', 'A photo is over 8 MB. Use a smaller picture.'],
    ['photo_unsupported', 'A photo could not be read. Use a JPEG, PNG, WebP or HEIC photo.'],
    ['photo_unavailable', 'A photo link could not be fetched. Add the photo from your device instead.'],
    ['request_too_large', 'That is too much to send at once. Use fewer or smaller photos.'],
    ['read_in_progress', 'A recipe is already being read. Let it finish, or cancel it.'],
  ])('%s', (code, message) => {
    expect(readErrorCopy({ code }, user).message).toBe(message)
    expect(readErrorCopy({ code }, user).retryable).toBe(false)
  })
  it('photos not supported by the model: Admins pick another model, Users ask an Admin', () => {
    expect(readErrorCopy({ code: 'photos_not_supported_by_model' }, admin)).toMatchObject({ message: "This model can't read photos.", hint: 'Pick a model that can read photos in Settings.', action: 'chooseModel' })
    expect(readErrorCopy({ code: 'photos_not_supported_by_model' }, user)).toMatchObject({ message: "This model can't read photos.", hint: 'Ask an Admin.', action: 'none' })
  })
  it('the Recipe Assistant is off (503)', () => {
    expect(readErrorCopy({ code: 'assistant_off' }, admin)).toMatchObject({ message: 'The Recipe Assistant is off.', hint: 'Turn it on in Settings.', action: 'settings' })
    expect(readErrorCopy({ code: 'assistant_off' }, user)).toMatchObject({ message: 'The Recipe Assistant is off.', hint: 'Ask an Admin.', action: 'none' })
  })
  it('too many reads (429): the Household limit with minutes', () => {
    expect(readErrorCopy({ code: 'too_many_reads', retryAfterSeconds: 720 }, user)).toMatchObject({
      message: 'Your Household has read 30 recipes in the last hour. Try again in 12 min.',
      action: 'none',
      retryable: false,
    })
  })
})

describe('unknown codes and the server text', () => {
  it('an unknown code gets a generic retryable line, never the server text', () => {
    const c = readErrorCopy({ code: 'brand_new_code', message: 'internal detail: sk-ant-abc' }, user)
    expect(c).toMatchObject({ message: 'The recipe could not be read. Try again.', action: 'retry', retryable: true })
    expect(JSON.stringify(c)).not.toContain('sk-ant')
  })
  it('known codes ignore the server message too', () => {
    expect(readErrorCopy({ code: 'assistant_busy', message: 'upstream 529 req_123' }, user).message).toBe('Anthropic is busy. Try again in a minute.')
  })
})

describe('errorFromApi', () => {
  it('reads code, retryAfterSeconds, errors and model from an ApiError', () => {
    const errors = [{ path: '$.x', message: 'bad' }]
    expect(errorFromApi(new ApiError(429, 'too_many_reads', 'x', { retryAfterSeconds: 90 }))).toEqual({ code: 'too_many_reads', retryAfterSeconds: 90 })
    expect(errorFromApi(new ApiError(502, 'assistant_invalid_output', 'x', { errors }))).toEqual({ code: 'assistant_invalid_output', errors })
    expect(errorFromApi(new ApiError(502, 'assistant_declined', 'x', { model: 'Claude Haiku 5.5' }))).toEqual({ code: 'assistant_declined', model: 'Claude Haiku 5.5' })
  })
  it('a lost connection is "network" and a timeout "timeout" (ApiError status 0)', () => {
    expect(errorFromApi(new ApiError(0, 'network', 'The network is unreachable'))).toEqual({ code: 'network' })
    expect(errorFromApi(new ApiError(0, 'timeout', 'The request timed out'))).toEqual({ code: 'timeout' })
  })
  it('a 404 on a poll is "expired"', () => {
    expect(errorFromApi(new ApiError(404, 'not_found', 'x'))).toEqual({ code: 'expired' })
  })
  it('a 404 on the start POST is "read_unavailable" (not "expired": nothing was lost)', () => {
    expect(errorFromApi(new ApiError(404, 'not_found', 'x'), 'start')).toEqual({ code: 'read_unavailable' })
    expect(readErrorCopy({ code: 'read_unavailable' }, user)).toMatchObject({
      message: 'The read could not be started. Reload the page and try again.',
      action: 'none',
      retryable: false,
    })
  })
  it('other start errors are mapped as for a poll', () => {
    expect(errorFromApi(new ApiError(429, 'too_many_reads', 'x', { retryAfterSeconds: 90 }), 'start')).toEqual({ code: 'too_many_reads', retryAfterSeconds: 90 })
  })
  it('anything else is "unknown"', () => {
    expect(errorFromApi(new Error('boom'))).toEqual({ code: 'unknown' })
  })
})
