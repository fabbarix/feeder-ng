import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { IngredientSelect } from './IngredientSelect'
import { ingredientOptions, type IngredientChoice } from './options'

// BR-D: the Ingredient options keep the order the caller gave (every Ingredient select, Base recipe or not). The only move: on an exact name tie
// (case and accents aside) a Base recipe's Ingredient comes before the plain one, taking the earlier of their two places.
const ing = (id: number, name: string, base = false): IngredientChoice => ({ id, name, baseUnit: 'g', ...(base ? { baseRecipe: { id: id * 10, name, archived: false } } : {}) })
const labels = (list: IngredientChoice[]) => ingredientOptions(list).map((o) => o.label)

describe('ingredientOptions order', () => {
  it('keeps the given order, even when it is not alphabetical', () => {
    expect(labels([ing(1, 'zucchini'), ing(2, 'apple'), ing(3, 'Milk'), ing(4, 'butter')])).toEqual(['zucchini', 'apple', 'Milk', 'butter'])
  })
  it('keeps the given order when no Ingredient is a Base recipe\'s, same names included', () => {
    expect(labels([ing(1, 'salt'), ing(2, 'Salt'), ing(3, 'sugar')])).toEqual(['salt', 'Salt', 'sugar'])
  })
  it('keeps the given order when Base recipes have different names from the others', () => {
    expect(labels([ing(1, 'zucchini'), ing(2, 'Roux', true), ing(3, 'apple')])).toEqual(['zucchini', 'Roux', 'apple'])
  })
  it('puts the Base recipe before a plain Ingredient of the same name next to it', () => {
    expect(labels([ing(1, 'milk'), ing(2, 'béchamel'), ing(3, 'Béchamel', true), ing(4, 'zucchini')])).toEqual(['milk', 'Béchamel', 'béchamel', 'zucchini'])
  })
  it('leaves the pair alone when the Base recipe already comes first', () => {
    expect(labels([ing(1, 'milk'), ing(2, 'Béchamel', true), ing(3, 'béchamel'), ing(4, 'zucchini')])).toEqual(['milk', 'Béchamel', 'béchamel', 'zucchini'])
  })
  it('swaps the two places when the pair is not together; the Ingredients between stay where they were', () => {
    expect(labels([ing(1, 'béchamel'), ing(2, 'milk'), ing(3, 'Béchamel', true)])).toEqual(['Béchamel', 'milk', 'béchamel'])
  })
  it('does not mutate the list it is given', () => {
    const list = [ing(1, 'béchamel'), ing(2, 'Béchamel', true)]
    ingredientOptions(list)
    expect(list.map((i) => i.id)).toEqual([1, 2])
  })
})

describe('IngredientSelect order on screen', () => {
  const list = [ing(1, 'zucchini'), ing(2, 'apple'), ing(3, 'béchamel'), ing(4, 'Béchamel', true)]
  it('lists the options in the given order with nothing typed', async () => {
    render(<IngredientSelect label="Ingredient" ingredients={list} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    const names = screen.getAllByRole('option').map((o) => o.textContent ?? '')
    expect(names.map((t) => t.slice(0, 4))).toEqual(['zucc', 'appl', 'Béch', 'béch'])
    expect(names[2]).toContain('Base recipe')
  })
})
