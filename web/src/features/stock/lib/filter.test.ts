import { describe, expect, it } from 'vitest'
import { makeTotal } from '../testData'
import { filterTotals, goOffPhrase, isDue, rowMeta } from './filter'

const today = '2026-11-09' // a Monday

describe('filterTotals', () => {
  const items = [
    makeTotal({ ingredientId: 1, name: 'Crème fraîche' }),
    makeTotal({ ingredientId: 2, name: 'feta', useSoon: true }),
    makeTotal({ ingredientId: 3, name: 'milk', spoiledCount: 1 }),
    makeTotal({ ingredientId: 4, name: 'chicken thighs', useSoon: true, spoiledCount: 2 }),
  ]
  const ids = (list: ReturnType<typeof filterTotals>) => list.map((i) => i.ingredientId)

  it('all keeps everything in order', () => expect(ids(filterTotals(items, 'all', ''))).toEqual([1, 2, 3, 4]))
  it('useSoon keeps use-soon items', () => expect(ids(filterTotals(items, 'useSoon', ''))).toEqual([2, 4]))
  it('spoiled keeps items with spoiled lots', () => expect(ids(filterTotals(items, 'spoiled', ''))).toEqual([3, 4]))
  it('matches the query ignoring case and accents', () => expect(ids(filterTotals(items, 'all', 'CREME'))).toEqual([1]))
  it('needs every word of the query', () => {
    expect(ids(filterTotals(items, 'all', 'chicken thi'))).toEqual([4])
    expect(ids(filterTotals(items, 'all', 'chicken milk'))).toEqual([])
  })
  it('combines the filter and the query', () => expect(ids(filterTotals(items, 'useSoon', 'f'))).toEqual([2]))
  it('does not mutate', () => {
    const copy = [...items]
    filterTotals(items, 'spoiled', 'm')
    expect(items).toEqual(copy)
  })
})

describe('goOffPhrase', () => {
  it.each([
    [null, ''],
    ['2026-11-08', 'went off yesterday'],
    ['2026-11-05', 'went off 4 days ago'],
    ['2026-11-09', 'goes off today'],
    ['2026-11-10', 'goes off tomorrow'],
    ['2026-11-12', 'goes off Thu'],
    ['2026-11-15', 'goes off Sun'],
    ['2026-11-16', 'goes off 16 Nov'],
    ['2026-12-01', 'goes off 1 Dec'],
  ])('%s -> %j', (date, phrase) => expect(goOffPhrase(date, today)).toBe(phrase))
})

describe('rowMeta', () => {
  it('is only the lot count when nothing is due', () => {
    expect(rowMeta(makeTotal({ lotCount: 1, nextGoesOff: '2026-11-20' }), today)).toBe('1 Stock Lot')
    expect(rowMeta(makeTotal({ lotCount: 3 }), today)).toBe('3 Stock Lots')
  })
  it('adds when it goes off for use-soon items', () => {
    expect(rowMeta(makeTotal({ lotCount: 1, useSoon: true, nextGoesOff: '2026-11-12' }), today)).toBe('1 Stock Lot · goes off Thu')
  })
  it('says went off for spoiled items', () => {
    expect(rowMeta(makeTotal({ lotCount: 2, spoiledCount: 1, nextGoesOff: '2026-11-05' }), today)).toBe('2 Stock Lots · went off 4 days ago')
  })
  it('has no suffix without a date', () => {
    expect(rowMeta(makeTotal({ lotCount: 1, useSoon: true, nextGoesOff: null }), today)).toBe('1 Stock Lot')
  })
})

describe('isDue', () => {
  it('is true for use-soon or spoiled', () => {
    expect(isDue(makeTotal({ useSoon: true }))).toBe(true)
    expect(isDue(makeTotal({ spoiledCount: 1 }))).toBe(true)
    expect(isDue(makeTotal())).toBe(false)
  })
})
