import { describe, expect, it } from 'vitest'
import type { AccessMember } from '../types'
import { unlinkedMembers } from './members'

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
