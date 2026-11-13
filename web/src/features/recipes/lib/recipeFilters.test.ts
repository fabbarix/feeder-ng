// hf-recipes-filter: the pure filter-state logic of the Recipes list header (docs/design/recipes-filter.md 6).
import { describe, expect, it } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import {
  activeFilterChips,
  filtersButtonLabel,
  filtersFromParams,
  tagFilterRows,
  withCourse,
  withoutFilters,
  withTag,
  type RecipeFilterState,
} from './recipeFilters'

const p = (s: string) => new URLSearchParams(s)
const colourOf = (name: string) => ({ fish: 'teal', roast: 'tomato', 'édamame': 'sage' } as Record<string, string | undefined>)[name.toLowerCase()]
const known = [
  { name: 'roast', recipes: 2 },
  { name: 'Fish', recipes: 3 },
  { name: 'Édamame', recipes: 1 },
  { name: 'kids', recipes: 1 },
  { name: 'Tag 10', recipes: 1 },
  { name: 'Tag 2', recipes: 1 },
]
const state = (s: Partial<RecipeFilterState>): RecipeFilterState => ({ kind: 'plannable', course: null, tag: '', ...s })

describe('filtersFromParams', () => {
  it('reads nothing from an empty URL', () => {
    expect(filtersFromParams(p(''), courseChoices)).toEqual({ kind: 'plannable', course: null, tag: '' })
  })
  it('reads kind, course and tag', () => {
    expect(filtersFromParams(p('kind=base&course=2&tag=fish'), courseChoices)).toEqual({ kind: 'base', course: 2, tag: 'fish' })
  })
  it('trims the Tag', () => {
    expect(filtersFromParams(p('tag=%20fish%20'), courseChoices).tag).toBe('fish')
  })
  it.each(['abc', '0', '-1', '2.5', '', '99'])('ignores course=%s (not a positive id of a known Course)', (v) => {
    expect(filtersFromParams(p(`course=${v}`), courseChoices).course).toBeNull()
  })
  it('ignores a Course while the household has fewer than two (no Course filter is offered then)', () => {
    expect(filtersFromParams(p('course=1'), courseChoices.slice(0, 1)).course).toBeNull()
    expect(filtersFromParams(p('course=1'), []).course).toBeNull()
  })
  it('anything else than kind=base is Recipes', () => {
    expect(filtersFromParams(p('kind=all'), courseChoices).kind).toBe('plannable')
  })
})

describe('withCourse, withTag, withoutFilters', () => {
  it('sets and deletes the course on a copy, keeping the other parameters', () => {
    const base = p('kind=base&sort=last_cooked_asc&tag=fish')
    const set = withCourse(base, 3)
    expect(set.get('course')).toBe('3')
    expect(set.get('kind')).toBe('base')
    expect(set.get('sort')).toBe('last_cooked_asc')
    expect(set.get('tag')).toBe('fish')
    expect(base.has('course')).toBe(false)
    expect(withCourse(set, null).has('course')).toBe(false)
  })
  it('sets and deletes the tag, escaping it in the query string', () => {
    const set = withTag(p('course=2'), 'fish & chips')
    expect(set.toString()).toBe('course=2&tag=fish+%26+chips')
    expect(withTag(set, '').has('tag')).toBe(false)
  })
  it('withoutFilters drops course and tag only', () => {
    const next = withoutFilters(p('kind=base&course=2&tag=fish&sort=name&q=x'))
    expect(next.has('course')).toBe(false)
    expect(next.has('tag')).toBe(false)
    expect(next.get('kind')).toBe('base')
    expect(next.get('sort')).toBe('name')
    expect(next.get('q')).toBe('x')
  })
})

describe('activeFilterChips', () => {
  const ctx = { courses: courseChoices, known, colourOf }
  it('has no chip without a filter', () => {
    expect(activeFilterChips(state({}), ctx)).toEqual([])
  })
  it('names the Course, then the Tag (in its colour), each with its remove label', () => {
    expect(activeFilterChips(state({ course: 1, tag: 'fish' }), ctx)).toEqual([
      { key: 'course', label: 'Main', removeLabel: 'Remove Course: Main' },
      { key: 'tag', label: 'Fish', removeLabel: 'Remove Tag: Fish', tagColour: 'teal' },
    ])
  })
  it('uses the known spelling of the Tag (matched by key), else the one in the URL', () => {
    expect(activeFilterChips(state({ tag: '  FISH ' }), ctx)[0]?.label).toBe('Fish')
    expect(activeFilterChips(state({ tag: 'sauce' }), ctx)).toEqual([{ key: 'tag', label: 'sauce', removeLabel: 'Remove Tag: sauce' }])
  })
  it('skips the Course on Base recipes (they have no Courses), keeps the Tag', () => {
    expect(activeFilterChips(state({ kind: 'base', course: 2, tag: 'roast' }), ctx).map((c) => c.key)).toEqual(['tag'])
  })
  it('skips a Course that is not a known one', () => {
    expect(activeFilterChips(state({ course: 99 }), ctx)).toEqual([])
  })
})

describe('filtersButtonLabel (the summary that names the Filters button)', () => {
  it.each([
    [0, 'Filters'],
    [1, 'Filters, 1 active'],
    [2, 'Filters, 2 active'],
  ])('%i -> %s', (n, text) => {
    expect(filtersButtonLabel(n)).toBe(text)
  })
})

describe('tagFilterRows: search and order', () => {
  const names = (rows: { name: string }[]) => rows.map((r) => r.name)
  it('lists every Tag by name, accents, case and numbers ordered as people read them', () => {
    expect(names(tagFilterRows(known, '', ''))).toEqual(['Édamame', 'Fish', 'kids', 'roast', 'Tag 2', 'Tag 10'])
  })
  it('puts the selected Tag first (matched by key) and marks it', () => {
    const rows = tagFilterRows(known, 'ROAST', '', colourOf)
    expect(names(rows)).toEqual(['roast', 'Édamame', 'Fish', 'kids', 'Tag 2', 'Tag 10'])
    expect(rows[0]).toEqual({ name: 'roast', recipes: 2, colour: 'tomato', selected: true })
    expect(rows.slice(1).every((r) => !r.selected)).toBe(true)
  })
  it('carries each Tag\'s colour and Recipe count', () => {
    expect(tagFilterRows(known, '', 'fish', colourOf)).toEqual([{ name: 'Fish', recipes: 3, colour: 'teal', selected: false }])
  })
  it('finds a Tag by part of its name, accents and case ignored', () => {
    expect(names(tagFilterRows(known, '', 'EDA'))).toEqual(['Édamame'])
    expect(names(tagFilterRows(known, '', 'tag'))).toEqual(['Tag 2', 'Tag 10'])
  })
  it('every word of the query must match', () => {
    expect(names(tagFilterRows(known, '', 'tag 1'))).toEqual(['Tag 10'])
    expect(names(tagFilterRows(known, '', '  '))).toHaveLength(known.length)
  })
  it('a search keeps the selected Tag first among the matches, and drops it when it does not match', () => {
    expect(names(tagFilterRows(known, 'Tag 10', 'tag'))).toEqual(['Tag 10', 'Tag 2'])
    expect(names(tagFilterRows(known, 'roast', 'fish'))).toEqual(['Fish'])
  })
  it('an unknown selected Tag (from ?tag=) is listed first with no Recipes', () => {
    const rows = tagFilterRows(known, 'sauce', '')
    expect(rows[0]).toEqual({ name: 'sauce', recipes: 0, colour: undefined, selected: true })
    expect(rows).toHaveLength(known.length + 1)
  })
  it('nothing matches: an empty list', () => {
    expect(tagFilterRows(known, '', 'zzz')).toEqual([])
  })
  it('handles many Tags', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Tag ${40 - i}`, recipes: i }))
    const rows = tagFilterRows(many, 'Tag 33', '')
    expect(rows).toHaveLength(40)
    expect(rows[0]?.name).toBe('Tag 33')
    expect(rows[1]?.name).toBe('Tag 1')
    expect(rows.at(-1)?.name).toBe('Tag 40')
  })
})
