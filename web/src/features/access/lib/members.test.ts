import { describe, expect, it } from 'vitest'
import type { AccessMember } from '../types'
import { linkableMembers, unlinkedMembers } from './members'

const m = (id: number, name: string, userId: number | null): AccessMember => ({ id, name, userId })

describe('unlinkedMembers', () => {
  it('keeps only the Members without a User, in the given order', () => {
    const list = [m(1, 'Sam', 4), m(3, 'Nonna', null), m(2, 'Anna', null)]
    expect(unlinkedMembers(list).map((x) => x.name)).toEqual(['Nonna', 'Anna'])
  })
  it('is empty when everybody has a User or nobody exists', () => {
    expect(unlinkedMembers([m(1, 'Sam', 4)])).toEqual([])
    expect(unlinkedMembers([])).toEqual([])
  })
  it('does not change its input', () => {
    const list = [m(1, 'Sam', 4), m(3, 'Nonna', null)]
    unlinkedMembers(list)
    expect(list).toHaveLength(2)
  })
})

describe('linkableMembers', () => {
  const withEmail = (id: number, email: string | null | undefined): AccessMember => ({ id, name: `M${id}`, userId: null, email })
  it('keeps Members with no email or with the requester\'s own email (case and spaces aside)', () => {
    const list = [withEmail(1, undefined), withEmail(2, null), withEmail(3, ''), withEmail(4, ' Zia@Example.test '), withEmail(5, 'other@example.test')]
    expect(linkableMembers(list, 'zia@example.test').map((x) => x.id)).toEqual([1, 2, 3, 4])
  })
  it('drops Members that already have a User', () => {
    expect(linkableMembers([m(1, 'Sam', 4)], 'zia@example.test')).toEqual([])
  })
})
