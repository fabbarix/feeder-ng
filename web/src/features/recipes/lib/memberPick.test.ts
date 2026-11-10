import { describe, expect, it } from 'vitest'
import { selectedMemberId, singleMember, type MemberRef } from './memberPick'

const members: MemberRef[] = [
  { id: 1, name: 'Anna', userId: 10 },
  { id: 2, name: 'Ben', userId: null },
]

describe('selectedMemberId', () => {
  it('prefers the explicit pick', () => {
    expect(selectedMemberId(members, 10, 2)).toBe(2)
  })
  it('falls back to the Member linked to the signed-in User', () => {
    expect(selectedMemberId(members, 10, undefined)).toBe(1)
  })
  it('is null when the User is not linked and nothing was picked', () => {
    expect(selectedMemberId(members, 99, undefined)).toBeNull()
    expect(selectedMemberId(members, null, undefined)).toBeNull()
  })
})

describe('singleMember', () => {
  it('takes the newly added id', () => {
    expect(singleMember(1, [1, 2])).toBe(2)
    expect(singleMember(null, [2])).toBe(2)
  })
  it('keeps the previous id when the only value is deselected', () => {
    expect(singleMember(1, [])).toBe(1)
  })
  it('is null when nothing is and was chosen', () => {
    expect(singleMember(null, [])).toBeNull()
  })
})
