// QA-3: the sign-in and access copy follows GLOSSARY.md. "Invite" is on the Access Request _Avoid_ list ("invited",
// "invitation" are the same word), "account" on the User and Household lists. The intended meaning of the sign-in intro:
// the Google email must be on the Allowlist, or signing in sends a sign-in request (an Access Request) for a User to approve.
import { describe, expect, it } from 'vitest'
import { accessStrings } from '../access/strings'
import { signinStrings } from './strings'

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return texts((value as (...a: string[]) => unknown)('x', 'y', 'z'))
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts)
  return []
}
const signin = texts(signinStrings)
const access = texts(accessStrings)

describe('sign-in and access copy: no _Avoid_ words from GLOSSARY.md', () => {
  it.each([
    ['invite, invited, invites, inviting, invitation', /\binvit(e|es|ed|ing|ation|ations)\b/i],
    ['account (User, Household _Avoid_)', /\baccounts?\b/i],
    ['join request, signup, application (Access Request _Avoid_)', /\bjoin requests?\b|\bsign-?ups?\b|\bapplications?\b/i],
    ['address (the GLOSSARY says "email")', /\baddress(es)?\b/i],
  ])('uses none of: %s', (_label, re) => {
    for (const t of [...signin, ...access]) expect(t, t).not.toMatch(re)
  })
})

describe('sign-in intro', () => {
  it('says the Google email must be on the Allowlist, or that a sign-in request waits for a User to approve it', () => {
    const intro = signinStrings.intro
    expect(intro).toContain('Feeder is a private app for one Household.')
    expect(intro).toMatch(/\bemail\b/)
    expect(intro).toContain('Allowlist')
    expect(intro).toMatch(/sign-in request/)
    expect(intro).toMatch(/\bUser\b/)
  })
})

describe('"email not verified" page', () => {
  it('says Google has not verified the email and offers another Google sign-in (no Allowlist or Admin fix)', () => {
    expect(signinStrings.emailNotVerifiedTitle).toBe('Email not verified')
    expect(signinStrings.emailNotVerifiedText).toBe('Google has not verified this email. Use a different Google sign-in.')
    expect(signinStrings.emailNotVerifiedText).not.toMatch(/Allowlist|Admin/i)
    expect(Object.keys(signinStrings).filter((k) => /invit/i.test(k))).toEqual([])
  })
})
