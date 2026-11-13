// RR4: every refusal and failure of the receipt flow as words (docs/design/receipt-reading.md section 9, plus the apply's codes).
// Pinned API of ./receiptErrors:
//   describeReceiptError(error: ReceiptErrorInput, o: { isAdmin: boolean }): { message: string; action: 'retry' | 'readAgain' | 'settings' | 'none' }
//   readAgainWait(seconds): string      "12 minutes", "30 seconds", "1 minute" (rounded up)
// The server's own message text is never shown: the copy is by code.
import { describe, expect, it } from 'vitest'
import { describeReceiptError, readAgainWait } from './receiptErrors'

const user = { isAdmin: false }
const admin = { isAdmin: true }
const d = (code: string, extra: Record<string, unknown> = {}, o = user) => describeReceiptError({ code, ...extra }, o)

describe('the table of section 9', () => {
  it.each([
    ['assistant_unreachable', "Couldn't reach the assistant. Check the connection and try again.", 'retry'],
    ['timeout', "Couldn't reach the assistant. Check the connection and try again.", 'retry'],
    ['network', 'Feeder could not be reached. Check your connection and try again.', 'retry'],
    ['assistant_busy', 'The assistant is busy. Try again in a minute.', 'retry'],
    ['assistant_rate_limited', 'The assistant is busy. Try again in a minute.', 'retry'],
    ['assistant_declined', 'The assistant would not read this photo. Try a clearer photo of the receipt.', 'none'],
    ['assistant_output_too_long', 'This receipt is too long to read at once. Read it in two parts.', 'none'],
    ['assistant_invalid_output', "The assistant's answer couldn't be used. Try again.", 'retry'],
    ['no_receipt_found', 'No receipt found in the photos. Take it flat, in good light.', 'none'],
    ['scans_empty', 'Scan something first.', 'none'],
  ])('%s', (code, message, action) => {
    expect(d(code)).toEqual({ message, action })
  })
})

describe('the photo codes use the Import copy', () => {
  it.each([
    ['photos_empty', 'Add at least one photo.'],
    ['too_many_photos', 'A read takes up to 4 photos.'],
    ['photo_too_large', 'A photo is over 8 MB. Use a smaller picture.'],
    ['photo_unsupported', 'A photo could not be read. Use a JPEG, PNG, WebP or HEIC photo.'],
  ])('%s', (code, message) => {
    expect(d(code)).toEqual({ message, action: 'none' })
  })
})

describe('the limiter', () => {
  it('read_in_progress asks to let the running read finish', () => {
    expect(d('read_in_progress')).toEqual({ message: 'A receipt is already being read. Let it finish, or cancel it.', action: 'none' })
  })
  it('too_many_reads says when to read again', () => {
    expect(d('too_many_reads', { retryAfterSeconds: 720 })).toEqual({ message: 'You can read again in 12 minutes.', action: 'none' })
  })
  it('too_many_reads without a time says "a while"', () => {
    expect(d('too_many_reads').message).toBe('You can read again in a while.')
  })
  it.each([
    [30, '30 seconds'],
    [59, '59 seconds'],
    [60, '1 minute'],
    [61, '2 minutes'],
    [720, '12 minutes'],
  ])('readAgainWait(%i) = %s', (s, text) => {
    expect(readAgainWait(s)).toBe(text)
  })
})

describe('assistant_unavailable (409, with a reason)', () => {
  it.each([
    ['off', 'The Recipe Assistant is off. Ask an Admin to turn it on.', 'The Recipe Assistant is off. Turn it on in Settings.'],
    ['no_secret_key', "The Recipe Assistant isn't set up yet. Ask an Admin.", 'The Recipe Assistant needs a secret key on the server first. Settings explains how.'],
    ['no_key', 'The Recipe Assistant needs an API key. Ask an Admin.', 'The Recipe Assistant needs an API key. Add it in Settings.'],
    ['key_unreadable', "The saved API key can't be read. Ask an Admin.", "The saved API key can't be read. Enter it again in Settings."],
    ['model_unavailable', 'The chosen model is no longer available. Ask an Admin.', 'The chosen model is no longer available. Pick another model in Settings.'],
  ])('%s: a User is sent to an Admin, an Admin to Settings', (reason, userText, adminText) => {
    expect(d('assistant_unavailable', { reason })).toEqual({ message: userText, action: 'none' })
    expect(d('assistant_unavailable', { reason }, admin)).toEqual({ message: adminText, action: 'settings' })
  })
  it('without a reason (the apply sends none) it uses the settings-problem copy', () => {
    expect(d('assistant_unavailable')).toEqual({ message: "The Recipe Assistant isn't working. An Admin can check it in Settings.", action: 'none' })
  })
})

describe('settings problems: a User is sent to an Admin; an Admin gets the specific message and the link (section 9)', () => {
  it.each([
    ['assistant_bad_key', "The Recipe Assistant's API key was refused. Replace the key in Settings."],
    ['assistant_billing', 'Anthropic reports a billing problem. Check it with Anthropic.'],
    ['assistant_forbidden', "This API key may not use the Recipe Assistant's model. Check the Anthropic workspace."],
    ['assistant_model_unavailable', 'The chosen model is no longer available. Pick another model in Settings.'],
  ])('%s', (code, adminText) => {
    expect(d(code)).toEqual({ message: "The Recipe Assistant isn't working. An Admin can check it in Settings.", action: 'none' })
    expect(d(code, {}, admin)).toEqual({ message: adminText, action: 'settings' })
  })
})

describe('the apply', () => {
  it('receipt_session_changed says the Scanned list changed since the read and offers Read it again', () => {
    expect(d('receipt_session_changed')).toEqual({ message: 'The Scanned list changed since the read.', action: 'readAgain' })
  })
  it('receipt_read_gone', () => {
    expect(d('receipt_read_gone')).toEqual({ message: 'This read is no longer kept (10 minutes).', action: 'readAgain' })
  })
  it('receipt_read_not_done', () => {
    expect(d('receipt_read_not_done')).toEqual({ message: 'The receipt is still being read.', action: 'readAgain' })
  })
  it('unknown_proposal', () => {
    expect(d('unknown_proposal')).toEqual({ message: 'That line is no longer on the receipt. Read the receipt again.', action: 'readAgain' })
  })
  it('add_incomplete', () => {
    expect(d('add_incomplete')).toEqual({ message: 'Choose the Ingredient and the Product name and pack size for this line first.', action: 'none' })
  })
  it('receipt_apply_failed says to check the Scanned list; the read is stale after a put-back, so Read again', () => {
    expect(d('receipt_apply_failed')).toEqual({ message: 'The receipt could not be applied. Check the Scanned list and try again.', action: 'readAgain' })
  })
  it('receipt_read_gone (a poll lost the read) uses the same copy', () => {
    expect(d('receipt_read_gone').message).toBe('This read is no longer kept (10 minutes).')
  })
})

describe('anything else', () => {
  it('has a plain message and offers Try again; it never shows the code', () => {
    const r = d('some_new_code')
    expect(r.action).toBe('retry')
    expect(r.message.length).toBeGreaterThan(0)
    expect(r.message).not.toContain('some_new_code')
  })
})
