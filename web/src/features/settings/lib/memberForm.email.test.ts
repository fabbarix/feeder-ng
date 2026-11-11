// A1 phase 2: the Member email in the editor's draft. The draft keeps the field as text ('' = none); the request body
// sends the trimmed address, or null when empty (the server stores no email).
import { describe, expect, it } from 'vitest'
import { memberDraft, memberFromDraft, memberProblem, memberEmailProblem } from './memberForm'

const base = { name: 'Nonna', colour: '#112233', avatar: '', portionFactor: 1 }

describe('memberDraft: email', () => {
  it('a new Member has an empty email', () => {
    expect(memberDraft().email).toBe('')
  })
  it('copies the address of a Member, and treats null as empty', () => {
    const m = { id: 3, name: 'Sam', colour: '#81b29a', avatar: '', portionFactor: 1, userId: null }
    expect(memberDraft({ ...m, email: 'sam@example.test' }).email).toBe('sam@example.test')
    expect(memberDraft({ ...m, email: null }).email).toBe('')
  })
})

describe('memberFromDraft: email', () => {
  it('trims the address', () => {
    expect(memberFromDraft({ ...base, email: '  Nonna@Example.test ' }).email).toBe('Nonna@Example.test')
  })
  it('sends null for empty or blank (the server lower-cases and stores the rest)', () => {
    expect(memberFromDraft({ ...base, email: '' }).email).toBeNull()
    expect(memberFromDraft({ ...base, email: '   ' }).email).toBeNull()
  })
})

describe('memberEmailProblem and memberProblem', () => {
  it('accepts empty and a plain address', () => {
    expect(memberEmailProblem('')).toBeNull()
    expect(memberEmailProblem('  ')).toBeNull()
    expect(memberEmailProblem('nonna@example.test')).toBeNull()
  })
  it.each(['nonna', 'nonna@', '@example.test', 'a b@example.test', 'a@b@example.test', 'a@example.test, b@example.test', `${'x'.repeat(250)}@example.test`])(
    'refuses %s with a message that names the email',
    (value) => {
      expect(memberEmailProblem(value)).toMatch(/email/i)
    },
  )
  it('memberProblem reports the name first, then the Portion Factor, then the email', () => {
    expect(memberProblem({ ...base, name: ' ', email: 'x' })).toMatch(/name/i)
    expect(memberProblem({ ...base, portionFactor: 9, email: 'x' })).toMatch(/Portion Factor/)
    expect(memberProblem({ ...base, email: 'x' })).toMatch(/email/i)
    expect(memberProblem({ ...base, email: 'nonna@example.test' })).toBeNull()
  })
})
