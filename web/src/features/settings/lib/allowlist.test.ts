import { describe, expect, it } from 'vitest'
import { emailBreak, isEmail, isLastAdmin, sharePayload, signInMessage } from './allowlist'

const a = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: true }
const b = { id: 2, email: 'b@example.test', displayName: 'B', isAdmin: false }

describe('isEmail', () => {
  it.each(['a@example.test', ' a@b.co '])('accepts %j', (v) => expect(isEmail(v)).toBe(true))
  it.each(['', 'nonna', 'a@b', '@b.co', 'a b@c.de'])('rejects %j', (v) => expect(isEmail(v)).toBe(false))
})

describe('isLastAdmin', () => {
  it('is true for a lone Admin only', () => {
    expect(isLastAdmin([a, b], a)).toBe(true)
    expect(isLastAdmin([a, b], b)).toBe(false)
    expect(isLastAdmin([a, { ...b, isAdmin: true }], a)).toBe(false)
  })
})

// B9-52 (SET-03): the sign-in message the Admin sends after adding an email. `origin` is window.location.origin, scheme included.
const origin = 'https://feeder.example.test'

describe('signInMessage', () => {
  it('says where to go and what to choose, with the origin and the email', () => {
    expect(signInMessage('nonna@example.test', origin)).toBe(
      'You can now sign in to Feeder, our Household\'s meal planner.\nOpen https://feeder.example.test and choose "Continue with Google", then use nonna@example.test.',
    )
  })
  it('uses neither "invite" nor "account" (GLOSSARY _Avoid_)', () => {
    expect(signInMessage('nonna@example.test', origin)).not.toMatch(/invit|account/i)
  })
})

describe('sharePayload', () => {
  const payload = () => sharePayload('nonna@example.test', origin)
  it('has a title, the text without the link, and the link in `url` (share targets append url themselves)', () => {
    expect(payload()).toEqual({
      title: 'Sign in to Feeder',
      text: 'You can now sign in to Feeder, our Household\'s meal planner. Choose "Continue with Google" and use nonna@example.test.',
      url: origin,
    })
    expect(payload().text).not.toContain(origin)
  })
  it('uses neither "invite" nor "account"', () => {
    expect(`${payload().title} ${payload().text}`).not.toMatch(/invit|account/i)
  })
})

// SET-03 / the Allowlist review: an address may wrap only where a person would break it, before "@" and after ".", never mid-word.
describe('emailBreak', () => {
  it('splits before the "@" and after each ".", and the pieces join back to the address', () => {
    expect(emailBreak('admin@example.test')).toEqual(['admin', '@example.', 'test'])
    expect(emailBreak('first.last@mail.example.test')).toEqual(['first.', 'last', '@mail.', 'example.', 'test'])
  })
  it('never loses or adds a character', () => {
    for (const e of ['a@b.co', 'chiara.rossi-verdi@famiglia.example.test', 'x+tag@y.z.example']) expect(emailBreak(e).join('')).toBe(e)
  })
  it('leaves a piece that is not an address whole', () => {
    expect(emailBreak('nonna')).toEqual(['nonna'])
    expect(emailBreak('')).toEqual([])
  })
})
