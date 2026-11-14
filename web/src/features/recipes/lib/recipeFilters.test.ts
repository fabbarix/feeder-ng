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
  toggleTag,
  withTags,
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
const state = (s: Partial<RecipeFilterState>): RecipeFilterState => ({ kind: 'plannable', course: null, tags: [], ...s })

describe('filtersFromParams', () => {
  it('reads nothing from an empty URL', () => {
    expect(filtersFromParams(p(''), courseChoices)).toEqual({ kind: 'plannable', course: null, tags: [] })
  })
  it('reads kind, course and tag', () => {
    expect(filtersFromParams(p('kind=base&course=2&tag=fish'), courseChoices)).toEqual({ kind: 'base', course: 2, tags: ['fish'] })
  })
  it('trims the Tag', () => {
    expect(filtersFromParams(p('tag=%20fish%20'), courseChoices).tags).toEqual(['fish'])
  })
  it('b8: reads every ?tag= in URL order (several Tags narrow the list)', () => {
    expect(filtersFromParams(p('tag=roast&course=2&tag=fish'), courseChoices).tags).toEqual(['roast', 'fish'])
  })
  it('b8: drops blank Tags and a repeat by key (the first spelling stays)', () => {
    expect(filtersFromParams(p('tag=&tag=%20&tag=Fish&tag=roast&tag=FISH'), courseChoices).tags).toEqual(['Fish', 'roast'])
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
  it('b8: withTags sets the Tags (repeated ?tag=, escaped), keeping the other parameters; none removes them all', () => {
    const set = withTags(p('course=2'), ['fish & chips', 'roast'])
    expect(set.toString()).toBe('course=2&tag=fish+%26+chips&tag=roast')
    expect(set.getAll('tag')).toEqual(['fish & chips', 'roast'])
    expect(withTags(set, ['kids']).getAll('tag')).toEqual(['kids'])
    expect(withTags(set, []).has('tag')).toBe(false)
    expect(withTags(p('tag=a'), ['', ' ', 'b', 'B']).getAll('tag')).toEqual(['b'])
  })
  it('b8: toggleTag adds a Tag at the end, or removes it when it is in force (matched by key), on a copy', () => {
    const base = p('kind=base&tag=fish')
    const added = toggleTag(base, 'roast')
    expect(added.getAll('tag')).toEqual(['fish', 'roast'])
    expect(added.get('kind')).toBe('base')
    expect(base.getAll('tag')).toEqual(['fish'])
    expect(toggleTag(added, 'FISH').getAll('tag')).toEqual(['roast'])
    expect(toggleTag(toggleTag(base, 'fish'), 'fish').getAll('tag')).toEqual(['fish'])
    expect(toggleTag(base, '  ').getAll('tag')).toEqual(['fish'])
  })
  it('withoutFilters drops course and every tag only', () => {
    const next = withoutFilters(p('kind=base&course=2&tag=fish&tag=roast&sort=name&q=x'))
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
    expect(activeFilterChips(state({ course: 1, tags: ['fish'] }), ctx)).toEqual([
      { key: 'course', label: 'Main', removeLabel: 'Remove Course: Main' },
      { key: 'tag:fish', label: 'Fish', removeLabel: 'Remove Tag: Fish', tagColour: 'teal' },
    ])
  })
  it('b8: one chip per Tag, in URL order after the Course, each keyed by its Tag', () => {
    const chips = activeFilterChips(state({ course: 1, tags: ['roast', 'Fish', 'sauce'] }), ctx)
    expect(chips.map((c) => c.key)).toEqual(['course', 'tag:roast', 'tag:fish', 'tag:sauce'])
    expect(chips.map((c) => c.label)).toEqual(['Main', 'roast', 'Fish', 'sauce'])
    expect(chips[1]).toMatchObject({ removeLabel: 'Remove Tag: roast', tagColour: 'tomato' })
    expect(chips[3]).toEqual({ key: 'tag:sauce', label: 'sauce', removeLabel: 'Remove Tag: sauce' })
  })
  it('uses the known spelling of the Tag (matched by key), else the one in the URL', () => {
    expect(activeFilterChips(state({ tags: ['  FISH '] }), ctx)[0]?.label).toBe('Fish')
    expect(activeFilterChips(state({ tags: ['sauce'] }), ctx)).toEqual([{ key: 'tag:sauce', label: 'sauce', removeLabel: 'Remove Tag: sauce' }])
  })
  it('skips the Course on Base recipes (they have no Courses), keeps the Tag', () => {
    expect(activeFilterChips(state({ kind: 'base', course: 2, tags: ['roast'] }), ctx).map((c) => c.key)).toEqual(['tag:roast'])
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
    expect(names(tagFilterRows(known, [], ''))).toEqual(['Édamame', 'Fish', 'kids', 'roast', 'Tag 2', 'Tag 10'])
  })
  it('puts the selected Tag first (matched by key) and marks it', () => {
    const rows = tagFilterRows(known, ['ROAST'], '', colourOf)
    expect(names(rows)).toEqual(['roast', 'Édamame', 'Fish', 'kids', 'Tag 2', 'Tag 10'])
    expect(rows[0]).toEqual({ name: 'roast', recipes: 2, colour: 'tomato', selected: true })
    expect(rows.slice(1).every((r) => !r.selected)).toBe(true)
  })
  it('carries each Tag\'s colour and Recipe count', () => {
    expect(tagFilterRows(known, [], 'fish', colourOf)).toEqual([{ name: 'Fish', recipes: 3, colour: 'teal', selected: false }])
  })
  it('finds a Tag by part of its name, accents and case ignored', () => {
    expect(names(tagFilterRows(known, [], 'EDA'))).toEqual(['Édamame'])
    expect(names(tagFilterRows(known, [], 'tag'))).toEqual(['Tag 2', 'Tag 10'])
  })
  it('every word of the query must match', () => {
    expect(names(tagFilterRows(known, [], 'tag 1'))).toEqual(['Tag 10'])
    expect(names(tagFilterRows(known, [], '  '))).toHaveLength(known.length)
  })
  it('a search keeps the selected Tag first among the matches, and drops it when it does not match', () => {
    expect(names(tagFilterRows(known, ['Tag 10'], 'tag'))).toEqual(['Tag 10', 'Tag 2'])
    expect(names(tagFilterRows(known, ['roast'], 'fish'))).toEqual(['Fish'])
  })
  it('an unknown selected Tag (from ?tag=) is listed first with no Recipes', () => {
    const rows = tagFilterRows(known, ['sauce'], '')
    expect(rows[0]).toEqual({ name: 'sauce', recipes: 0, colour: undefined, selected: true })
    expect(rows).toHaveLength(known.length + 1)
  })
  it('b8: several selected Tags come first, in the order they were chosen, then the others by name', () => {
    const rows = tagFilterRows(known, ['roast', 'FISH'], '', colourOf)
    expect(names(rows)).toEqual(['roast', 'Fish', 'Édamame', 'kids', 'Tag 2', 'Tag 10'])
    expect(rows.map((r) => r.selected)).toEqual([true, true, false, false, false, false])
  })
  it('b8: a search drops the selected Tags that do not match, keeps those that do first', () => {
    expect(names(tagFilterRows(known, ['roast', 'Tag 10'], 'tag'))).toEqual(['Tag 10', 'Tag 2'])
  })
  it('nothing matches: an empty list', () => {
    expect(tagFilterRows(known, [], 'zzz')).toEqual([])
  })
  it('handles many Tags', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Tag ${40 - i}`, recipes: i }))
    const rows = tagFilterRows(many, ['Tag 33'], '')
    expect(rows).toHaveLength(40)
    expect(rows[0]?.name).toBe('Tag 33')
    expect(rows[1]?.name).toBe('Tag 1')
    expect(rows.at(-1)?.name).toBe('Tag 40')
  })
})
