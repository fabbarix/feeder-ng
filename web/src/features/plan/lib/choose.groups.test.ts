// B9-38 (PC-10): Choose a Recipe's groups for a Course.
import { describe, expect, it } from 'vitest'
import type { RecipeChoice } from '../types'
import { chooseGroups } from './choose'

const r = (id: number, name: string, courseIds?: number[]): RecipeChoice => ({ id, name, tags: [], courseIds })
const recipes = [r(1, 'Lemon ricotta cake', [3]), r(2, 'Baked apples', [1]), r(3, 'Pancakes', [1, 3]), r(4, 'Plain rice')]

describe('chooseGroups', () => {
  it('a Course other than the main one: the Recipes marked with it, then the others, each in the order given', () => {
    const g = chooseGroups(recipes, { id: 3, main: false })
    expect(g.marked.map((x) => x.name)).toEqual(['Lemon ricotta cake', 'Pancakes'])
    expect(g.other.map((x) => x.name)).toEqual(['Baked apples', 'Plain rice'])
  })

  it('the main Course is one group', () => {
    const g = chooseGroups(recipes, { id: 1, main: true })
    expect(g.marked.map((x) => x.name)).toEqual(['Lemon ricotta cake', 'Baked apples', 'Pancakes', 'Plain rice'])
    expect(g.other).toEqual([])
  })

  it('a Recipe that carries no Course list counts as not marked', () => {
    expect(chooseGroups([r(4, 'Plain rice')], { id: 3, main: false })).toEqual({ marked: [], other: [r(4, 'Plain rice')] })
  })
})
