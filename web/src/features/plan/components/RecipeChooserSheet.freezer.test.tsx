// B5-LOW: Choose a Recipe has "From the freezer": frozen Leftovers of Recipes that fit the Course (Cooked takes only the portions used, U5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { frozenChilli } from '../../../lib/leftovers/fixtures'
import { RecipeChooserSheet } from './RecipeChooserSheet'

const recipes = [
  { id: 10, name: 'Chilli', tags: [] },
  { id: 2, name: 'Risotto', tags: [] },
]
const frozen = [
  frozenChilli({ id: 5, recipeId: 10, recipeName: 'Chilli', portions: 3, storagePlaceName: 'Garage Freezer' }),
  frozenChilli({ id: 6, recipeId: 99, recipeName: 'Stew', portions: 2 }), // not a Recipe of this Course
  frozenChilli({ id: 7, recipeId: 2, recipeName: 'Risotto', portions: 1.5, storagePlaceId: null, storagePlaceName: null }),
]

function setup(leftovers = frozen) {
  const onPick = vi.fn()
  const onPickLeftover = vi.fn()
  render(<RecipeChooserSheet open onClose={() => {}} recipes={recipes} isLoading={false} onPick={onPick} frozenLeftovers={leftovers} onPickLeftover={onPickLeftover} />)
  return { onPick, onPickLeftover }
}

describe('RecipeChooserSheet: From the freezer', () => {
  it('lists the frozen Leftovers of the Recipes offered, with portions and Storage Place', () => {
    setup()
    const list = screen.getByRole('list', { name: 'From the freezer' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Chilli'),
      expect.stringContaining('Risotto'),
    ])
    expect(within(list).getByText('3 portions · Garage Freezer')).toBeInTheDocument()
    expect(within(list).getByText('1.5 portions · Not sorted')).toBeInTheDocument()
    expect(within(list).queryByText('Stew')).toBeNull()
  })
  it('comes before the Recipes list', () => {
    setup()
    const lists = screen.getAllByRole('list').map((l) => l.getAttribute('aria-label'))
    expect(lists.indexOf('From the freezer')).toBeLessThan(lists.indexOf('Recipes'))
  })
  it('choosing one picks that Leftover, not the Recipe', async () => {
    const { onPick, onPickLeftover } = setup()
    await userEvent.click(within(screen.getByRole('list', { name: 'From the freezer' })).getByRole('button', { name: /Chilli/ }))
    expect(onPickLeftover).toHaveBeenCalledWith(5)
    expect(onPick).not.toHaveBeenCalled()
  })
  it('the search narrows both lists', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Recipes' }), 'ris')
    const list = screen.getByRole('list', { name: 'From the freezer' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('Risotto')).toBeInTheDocument()
  })
  it('has no section without a frozen Leftover that fits', () => {
    setup([])
    expect(screen.queryByRole('list', { name: 'From the freezer' })).toBeNull()
  })
  it('a frozen Leftover with nothing left is not offered', () => {
    setup([frozenChilli({ id: 5, recipeId: 10, portions: 0 })])
    expect(screen.queryByRole('list', { name: 'From the freezer' })).toBeNull()
  })
})
