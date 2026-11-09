import { describe, expect, it } from 'vitest'
import { memberDraft, memberFromDraft, memberProblem } from './memberForm'

describe('memberDraft', () => {
  it('starts a new Member at Portion Factor 1 with no name', () => {
    expect(memberDraft()).toMatchObject({ name: '', avatar: '', portionFactor: 1 })
    expect(memberDraft().colour).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('copies an existing Member', () => {
    const m = { id: 3, name: 'Sam', colour: '#81b29a', avatar: '🦊', portionFactor: 0.5, userId: 2 }
    expect(memberDraft(m)).toEqual({ name: 'Sam', colour: '#81b29a', avatar: '🦊', portionFactor: 0.5 })
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
    expect(memberFromDraft({ name: ' Anna ', colour: '#112233', avatar: ' ', portionFactor: 1 })).toEqual({ name: 'Anna', colour: '#112233', avatar: '', portionFactor: 1 })
  })
})
