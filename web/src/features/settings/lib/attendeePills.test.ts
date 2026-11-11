import { describe, expect, it } from 'vitest'
import type { Member } from '../types'
import { attendeePills } from './attendeePills'

const m = (id: number, name: string): Member => ({ id, name, colour: '#3366cc', avatar: '', portionFactor: 1, userId: null, email: null })
const members = ['Anna', 'Marco', 'Sam', 'Pia', 'Nonna', 'Zio'].map((n, i) => m(i + 1, n))
const att = (...ids: number[]) => ids.map((memberId) => ({ memberId, portionFactorOverride: null }))

describe('attendeePills: show 4 and "+N"', () => {
  it('shows everyone up to four, in Members order', () => {
    const r = attendeePills(att(3, 1, 2), members)
    expect(r.state).toBe('some')
    expect(r.shown.map((x) => x.name)).toEqual(['Anna', 'Marco', 'Sam'])
    expect(r.more).toEqual([])
  })
  it('exactly four fit; five or six show four and put the rest behind +N', () => {
    expect(attendeePills(att(1, 2, 3, 4), members).more).toEqual([])
    const r = attendeePills(att(1, 2, 3, 4, 5, 6), members)
    expect(r.shown.map((x) => x.name)).toEqual(['Anna', 'Marco', 'Sam', 'Pia'])
    expect(r.more.map((x) => x.name)).toEqual(['Nonna', 'Zio'])
  })
  it('max is adjustable', () => {
    expect(attendeePills(att(1, 2, 3), members, 2).more.map((x) => x.name)).toEqual(['Sam'])
  })
  it('nobody, including attendees whose Member was deleted', () => {
    expect(attendeePills([], members).state).toBe('nobody')
    expect(attendeePills(att(99), members)).toEqual({ state: 'nobody', shown: [], more: [] })
  })
})
