// Tags are ordered by name (user decision).
import { describe, expect, it } from 'vitest'
import { sortTagsByName } from './order'

describe('sortTagsByName', () => {
  it('orders by name, case ignored', () => {
    const tags = [{ id: 1, name: 'pasta' }, { id: 2, name: 'Fish' }, { id: 3, name: 'Roast' }]
    expect(sortTagsByName(tags).map((t) => t.name)).toEqual(['Fish', 'pasta', 'Roast'])
  })
  it('ignores accents in the comparison and breaks ties by id', () => {
    const tags = [{ id: 5, name: 'eclair' }, { id: 2, name: 'Éclair' }, { id: 9, name: 'Apple' }]
    expect(sortTagsByName(tags).map((t) => t.id)).toEqual([9, 2, 5])
  })
  it('returns a copy and keeps the other fields', () => {
    const tags = [{ id: 2, name: 'b', extra: 1 }, { id: 1, name: 'a', extra: 2 }]
    const sorted = sortTagsByName(tags)
    expect(sorted).not.toBe(tags)
    expect(tags[0]!.id).toBe(2)
    expect(sorted[0]).toEqual({ id: 1, name: 'a', extra: 2 })
  })
})
