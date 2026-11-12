// Beta.5 F7: the Recipes sort, one pure rule shared with the server (plan 2.7; ties by name).
import { describe, expect, it } from 'vitest'
import { DEFAULT_RECIPE_SORT, RECIPE_SORTS, parseSort, resolveSort, sortRecipes } from './sort'

const r = (id: number, name: string, lastCookedOn: string | null) => ({ id, name, lastCookedOn })
const list = [
  r(1, 'Chilli', '2026-11-08'),
  r(2, 'borscht', null),
  r(3, 'Dal', '2026-10-01'),
  r(4, 'Apple pie', '2026-10-01'),
  r(5, 'eggs', null),
]
const names = (l: { name: string }[]) => l.map((x) => x.name)

describe('the sorts', () => {
  it('are name, longest ago first, most recent first; name is the default', () => {
    expect(RECIPE_SORTS).toEqual(['name', 'last_cooked_asc', 'last_cooked_desc'])
    expect(DEFAULT_RECIPE_SORT).toBe('name')
  })
})

describe('parseSort', () => {
  it('accepts the three names', () => {
    expect(parseSort('name')).toBe('name')
    expect(parseSort('last_cooked_asc')).toBe('last_cooked_asc')
    expect(parseSort('last_cooked_desc')).toBe('last_cooked_desc')
  })
  it('gives null for anything else', () => {
    for (const bad of [null, undefined, '', 'newest', 'NAME', 'last_cooked']) expect(parseSort(bad)).toBeNull()
  })
})

describe('resolveSort', () => {
  it('prefers the URL, then the remembered sort, then name', () => {
    expect(resolveSort('last_cooked_asc', 'last_cooked_desc')).toBe('last_cooked_asc')
    expect(resolveSort(null, 'last_cooked_desc')).toBe('last_cooked_desc')
    expect(resolveSort(null, null)).toBe('name')
  })
  it('skips an invalid value and falls to the next source', () => {
    expect(resolveSort('newest', 'last_cooked_desc')).toBe('last_cooked_desc')
    expect(resolveSort('newest', 'also-bad')).toBe('name')
  })
})

describe('sortRecipes', () => {
  it('by name: case-insensitive, then id', () => {
    expect(names(sortRecipes(list, 'name'))).toEqual(['Apple pie', 'borscht', 'Chilli', 'Dal', 'eggs'])
    expect(sortRecipes([r(9, 'Dal', null), r(2, 'dal', null)], 'name').map((x) => x.id)).toEqual([2, 9])
  })
  it('longest ago first: not cooked yet first (by name), then oldest, ties by name', () => {
    expect(names(sortRecipes(list, 'last_cooked_asc'))).toEqual(['borscht', 'eggs', 'Apple pie', 'Dal', 'Chilli'])
  })
  it('most recent first: newest first, ties by name, not cooked yet last (by name)', () => {
    expect(names(sortRecipes(list, 'last_cooked_desc'))).toEqual(['Chilli', 'Apple pie', 'Dal', 'borscht', 'eggs'])
  })
  it('puts a Recipe never cooked before one cooked in either direction of "longest ago"', () => {
    const two = [r(1, 'A', '2000-01-01'), r(2, 'Z', null)]
    expect(names(sortRecipes(two, 'last_cooked_asc'))).toEqual(['Z', 'A'])
    expect(names(sortRecipes(two, 'last_cooked_desc'))).toEqual(['A', 'Z'])
  })
  it('does not mutate its input and handles an empty list', () => {
    const copy = [...list]
    sortRecipes(list, 'last_cooked_desc')
    expect(list).toEqual(copy)
    expect(sortRecipes([], 'last_cooked_asc')).toEqual([])
  })
})
