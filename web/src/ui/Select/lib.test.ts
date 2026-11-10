import { describe, expect, it } from 'vitest'
import { filterOptions, groupOptions, nextEnabledIndex, normalise, typeAheadMatch, type SelectOption } from './lib'

const o = (label: string, extra: Partial<SelectOption> = {}): SelectOption => ({ value: label, label, ...extra })

describe('normalise', () => {
  it('lower-cases, strips accents and trims', () => {
    expect(normalise('  Crème Brûlée ')).toBe('creme brulee')
  })
})

describe('filterOptions', () => {
  const options = [o('Pasta e fagioli', { meta: '45 min' }), o('Chicken tikka', { keywords: ['curry'] }), o('Crème brûlée')]
  it('returns everything for an empty or blank query', () => {
    expect(filterOptions(options, '')).toHaveLength(3)
    expect(filterOptions(options, '   ')).toHaveLength(3)
  })
  it('matches label, meta and keywords, ignoring case and accents', () => {
    expect(filterOptions(options, 'PASTA').map((x) => x.label)).toEqual(['Pasta e fagioli'])
    expect(filterOptions(options, '45').map((x) => x.label)).toEqual(['Pasta e fagioli'])
    expect(filterOptions(options, 'curry').map((x) => x.label)).toEqual(['Chicken tikka'])
    expect(filterOptions(options, 'creme').map((x) => x.label)).toEqual(['Crème brûlée'])
  })
  it('requires every word of the query, in any order', () => {
    expect(filterOptions(options, 'fagioli pasta')).toHaveLength(1)
    expect(filterOptions(options, 'pasta tikka')).toHaveLength(0)
  })
})

describe('groupOptions', () => {
  it('puts ungrouped options first, then groups in first-appearance order', () => {
    const groups = groupOptions([o('a', { group: 'Tuesday' }), o('b'), o('c', { group: 'Monday' }), o('d', { group: 'Tuesday' })])
    expect(groups.map((g) => g.group)).toEqual([null, 'Tuesday', 'Monday'])
    expect(groups[1]?.options.map((x) => x.label)).toEqual(['a', 'd'])
  })
  it('returns no groups for no options', () => {
    expect(groupOptions([])).toEqual([])
  })
})

describe('nextEnabledIndex', () => {
  const options = [o('a'), o('b', { disabled: true }), o('c'), o('d', { disabled: true })]
  it('skips disabled options', () => {
    expect(nextEnabledIndex(options, 0, 1)).toBe(2)
    expect(nextEnabledIndex(options, 2, -1)).toBe(0)
  })
  it('starts from -1 at the first enabled option', () => {
    expect(nextEnabledIndex(options, -1, 1)).toBe(0)
  })
  it('stays put at the ends (no wrap)', () => {
    expect(nextEnabledIndex(options, 2, 1)).toBe(2)
    expect(nextEnabledIndex(options, 0, -1)).toBe(0)
  })
})

describe('typeAheadMatch', () => {
  const options = [o('Apple'), o('Apricot'), o('Banana'), o('Blueberry'), o('Cherry', { disabled: true })]
  it('finds the first label starting with the buffer', () => {
    expect(typeAheadMatch(options, 'b', -1)).toBe(2)
  })
  it('a single repeated letter cycles after the active option', () => {
    expect(typeAheadMatch(options, 'b', 2)).toBe(3)
    expect(typeAheadMatch(options, 'a', 1)).toBe(0)
  })
  it('a longer buffer narrows from the active option (inclusive)', () => {
    expect(typeAheadMatch(options, 'bl', 2)).toBe(3)
    expect(typeAheadMatch(options, 'ban', 2)).toBe(2)
  })
  it('ignores case and accents, skips disabled, returns -1 when nothing matches', () => {
    expect(typeAheadMatch(options, 'BA', -1)).toBe(2)
    expect(typeAheadMatch(options, 'ch', -1)).toBe(-1)
    expect(typeAheadMatch(options, 'z', -1)).toBe(-1)
  })
})
