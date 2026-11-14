// hf-recipes-filter: useRecipeFilters keeps Kind, Course and Tag in the URL and derives the chips (docs/design/recipes-filter.md 6).
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { useRecipeFilters } from './useRecipeFilters'

const known = [{ name: 'Fish', recipes: 3 }, { name: 'roast', recipes: 2 }]
const colourOf = (n: string) => (n.toLowerCase() === 'fish' ? 'teal' : undefined)

function setup(url = '/recipes', courses = courseChoices) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return renderHook(
    () => {
      const filters = useRecipeFilters(courses, known, colourOf)
      const location = useLocation()
      return { filters, search: location.search, navType: useNavigationType() }
    },
    { wrapper },
  )
}

describe('useRecipeFilters: reading the URL', () => {
  it('starts with no filter', () => {
    const { result } = setup()
    expect(result.current.filters).toMatchObject({ kind: 'plannable', course: null, tags: [], chips: [], count: 0 })
  })
  it('reads Kind, Course and Tag from the URL (a link or the back button restores them)', () => {
    const { result } = setup('/recipes?course=2&tag=fish')
    expect(result.current.filters).toMatchObject({ kind: 'plannable', course: 2, tags: ['fish'], count: 2 })
    expect(result.current.filters.chips.map((c) => c.label)).toEqual(['Side', 'Fish'])
  })
  it('on Base recipes the Course is not in force and not counted, the Tag is', () => {
    const { result } = setup('/recipes?kind=base&course=2&tag=fish')
    expect(result.current.filters).toMatchObject({ kind: 'base', course: null, tags: ['fish'], count: 1 })
  })
  it('ignores a Course that is not one of the household\'s', () => {
    const { result } = setup('/recipes?course=42')
    expect(result.current.filters.course).toBeNull()
    expect(result.current.filters.count).toBe(0)
  })
})

describe('useRecipeFilters: writing the URL', () => {
  it('setCourse puts ?course= in the URL and replaces the history entry', () => {
    const { result } = setup('/recipes?tag=fish')
    act(() => result.current.filters.setCourse(3))
    expect(new URLSearchParams(result.current.search).get('course')).toBe('3')
    expect(new URLSearchParams(result.current.search).get('tag')).toBe('fish')
    expect(result.current.navType).toBe('REPLACE')
    expect(result.current.filters.course).toBe(3)
    act(() => result.current.filters.setCourse(null))
    expect(result.current.search).toBe('?tag=fish')
  })
  it('toggleTag puts ?tag= in the URL; choosing it again clears it', () => {
    const { result } = setup()
    act(() => result.current.filters.toggleTag('roast'))
    expect(result.current.search).toBe('?tag=roast')
    expect(result.current.navType).toBe('REPLACE')
    act(() => result.current.filters.toggleTag('roast'))
    expect(result.current.search).toBe('')
  })
  it('choosing the selected Tag again clears it (matched by key)', () => {
    const { result } = setup('/recipes?tag=Roast')
    act(() => result.current.filters.toggleTag('roast'))
    expect(result.current.filters.tags).toEqual([])
  })
  it('setKind keeps the other parameters', () => {
    const { result } = setup('/recipes?tag=fish&course=1')
    act(() => result.current.filters.setKind('base'))
    const params = new URLSearchParams(result.current.search)
    expect(params.get('kind')).toBe('base')
    expect(params.get('tag')).toBe('fish')
    expect(params.get('course')).toBe('1')
    act(() => result.current.filters.setKind('plannable'))
    expect(new URLSearchParams(result.current.search).has('kind')).toBe(false)
  })
  it('remove drops the one filter a chip stands for', () => {
    const { result } = setup('/recipes?course=1&tag=fish')
    act(() => result.current.filters.remove('course'))
    expect(result.current.search).toBe('?tag=fish')
    act(() => result.current.filters.remove('tag:fish'))
    expect(result.current.search).toBe('')
  })
  it('clear drops Course and Tag, keeps Kind and Sort', () => {
    const { result } = setup('/recipes?kind=base&sort=last_cooked_asc&course=1&tag=fish')
    act(() => result.current.filters.clear())
    const params = new URLSearchParams(result.current.search)
    expect([...params.keys()].sort()).toEqual(['kind', 'sort'])
    expect(result.current.filters.count).toBe(0)
    expect(result.current.navType).toBe('REPLACE')
  })
})

describe('useRecipeFilters: several Tags (b8-recipes, docs/dev/design/b8-recipes.md 3.2)', () => {
  it('reads every ?tag= in URL order, one chip each after the Course, and counts them all', () => {
    const { result } = setup('/recipes?tag=roast&course=2&tag=fish')
    expect(result.current.filters.tags).toEqual(['roast', 'fish'])
    expect(result.current.filters.chips.map((c) => c.label)).toEqual(['Side', 'roast', 'Fish'])
    expect(result.current.filters.chips.map((c) => c.key)).toEqual(['course', 'tag:roast', 'tag:fish'])
    expect(result.current.filters.count).toBe(3)
  })
  it('a single ?tag=x URL works as before', () => {
    const { result } = setup('/recipes?tag=fish')
    expect(result.current.filters).toMatchObject({ tags: ['fish'], count: 1 })
  })
  it('toggleTag adds a Tag to the URL, keeps the others, replaces the history entry', () => {
    const { result } = setup('/recipes?tag=fish&course=1')
    act(() => result.current.filters.toggleTag('roast'))
    expect(new URLSearchParams(result.current.search).getAll('tag')).toEqual(['fish', 'roast'])
    expect(new URLSearchParams(result.current.search).get('course')).toBe('1')
    expect(result.current.navType).toBe('REPLACE')
    expect(result.current.filters.tags).toEqual(['fish', 'roast'])
  })
  it('toggleTag on a Tag in force removes just that Tag (matched by key)', () => {
    const { result } = setup('/recipes?tag=fish&tag=Roast')
    act(() => result.current.filters.toggleTag('roast'))
    expect(result.current.filters.tags).toEqual(['fish'])
    expect(result.current.search).toBe('?tag=fish')
  })
  it('remove("tag:<key>") drops that Tag only; remove("course") drops the Course only', () => {
    const { result } = setup('/recipes?course=1&tag=fish&tag=roast')
    act(() => result.current.filters.remove('tag:fish'))
    expect(result.current.search).toBe('?course=1&tag=roast')
    act(() => result.current.filters.remove('course'))
    expect(result.current.search).toBe('?tag=roast')
    act(() => result.current.filters.remove('tag:roast'))
    expect(result.current.search).toBe('')
  })
  it('clear drops every Tag and the Course, keeps Kind and Sort', () => {
    const { result } = setup('/recipes?kind=base&sort=last_cooked_asc&tag=fish&tag=roast&tag=kids')
    act(() => result.current.filters.clear())
    const params = new URLSearchParams(result.current.search)
    expect([...params.keys()].sort()).toEqual(['kind', 'sort'])
    expect(result.current.filters.count).toBe(0)
  })
})
