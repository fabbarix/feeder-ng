import { describe, expect, it } from 'vitest'
import { availableUsers, memberDraft, memberFromDraft, memberProblem } from './memberForm'

describe('memberDraft', () => {
  it('starts a new Member at Portion Factor 1 with no name', () => {
    expect(memberDraft()).toMatchObject({ name: '', avatar: '', portionFactor: 1 })
    expect(memberDraft().colour).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('copies an existing Member', () => {
    const m = { id: 3, name: 'Sam', colour: '#81b29a', avatar: '🦊', portionFactor: 0.5, userId: 2, email: null }
    expect(memberDraft(m)).toEqual({ name: 'Sam', colour: '#81b29a', avatar: '🦊', portionFactor: 0.5, email: '' })
  })
})

describe('memberProblem', () => {
  it('needs a name', () => {
    expect(memberProblem({ ...memberDraft(), name: '  ' })).toMatch(/name/i)
    expect(memberProblem({ ...memberDraft(), name: 'Anna' })).toBeNull()
  })

  it('keeps the Portion Factor in range', () => {
    expect(memberProblem({ ...memberDraft(), name: 'A', portionFactor: 4 })).toMatch(/Portion Factor/)
    expect(memberProblem({ ...memberDraft(), name: 'A', portionFactor: 0 })).toMatch(/Portion Factor/)
  })
})

describe('memberFromDraft', () => {
  it('trims the name and avatar', () => {
    expect(memberFromDraft({ name: ' Anna ', colour: '#112233', avatar: ' ', portionFactor: 1, email: '' })).toEqual({ name: 'Anna', colour: '#112233', avatar: '', portionFactor: 1, email: null })
  })
})

describe('availableUsers (WP11)', () => {
  const users = [{ id: 1, displayName: 'Admin' }, { id: 2, displayName: 'Cook' }, { id: 3, displayName: 'Guest' }]
  const members = [{ id: 10, userId: 2 }, { id: 11, userId: null }, { id: 12, userId: 3 }]

  it('leaves out Users linked to another Member', () => {
    expect(availableUsers(users, members, { id: 11 }).map((u) => u.id)).toEqual([1])
  })
  it('keeps the User linked to the Member being edited', () => {
    expect(availableUsers(users, members, { id: 10 }).map((u) => u.id)).toEqual([1, 2])
  })
  it('when adding, offers only Users nobody is linked to', () => {
    expect(availableUsers(users, members).map((u) => u.id)).toEqual([1])
  })
  it('keeps the order and the extra fields of the input', () => {
    expect(availableUsers(users, [], undefined)).toEqual(users)
  })
})
