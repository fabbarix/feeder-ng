// SR5 (13.5 step 2): "Something else": Ingredient | Supply as a Segmented, a custom Select with subheaders and search, New Ingredient / New Supply.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Ingredient, SearchResult } from '../../ingredients/types'
import { addButton, choose, dialog, kindGroup, lines, openSomethingElse, packGroup, setup } from './newProduct.test-helper'

const kindRadio = (name: 'Ingredient' | 'Supply') => within(kindGroup()).getByRole('radio', { name })
const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '')

describe('NewProductSheet: Something else', () => {
  it('Something else on step 1 reveals the Segmented and the Select', async () => {
    setup({ lines })
    await openSomethingElse()
    expect(within(dialog()).queryByRole('group', { name: 'Which Line is it?' })).toBeNull()
    expect(kindGroup()).toBeInTheDocument()
    expect(within(dialog()).getByRole('combobox', { name: /Ingredient/ })).toBeInTheDocument()
  })

  it('is a Segmented Ingredient | Supply that opens on Ingredient', () => {
    setup()
    expect(within(kindGroup()).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Ingredient', 'Supply'])
    expect(kindRadio('Ingredient')).toBeChecked()
  })

  it('uses no native select, checkbox, radio or bare input', () => {
    setup()
    expect(document.querySelector('select, input[type=radio], input[type=checkbox]')).toBeNull()
  })

  it('the Ingredient Select lists Ingredients under an "Ingredients" subheader and no Supplies', async () => {
    setup()
    await userEvent.click(within(dialog()).getByRole('combobox', { name: /Ingredient/ }))
    const group = within(screen.getByRole('listbox')).getByRole('group', { name: 'Ingredients' })
    expect(within(group).getAllByRole('option').map((o) => o.textContent).join('|')).toMatch(/passata.*milk|milk.*passata/)
    expect(options().join('|')).not.toMatch(/Dish soap|Dishwasher/)
  })

  it('Supply swaps the Select to the Supplies, under a "Supplies" subheader, and names it Supply', async () => {
    setup()
    await userEvent.click(kindRadio('Supply'))
    await userEvent.click(within(dialog()).getByRole('combobox', { name: /Supply/ }))
    const group = within(screen.getByRole('listbox')).getByRole('group', { name: 'Supplies' })
    expect(within(group).getAllByRole('option')).toHaveLength(2)
    expect(options().join('|')).toMatch(/Dish soap/)
    expect(options().join('|')).toMatch(/Dishwasher tablets/)
    expect(options().join('|')).not.toMatch(/passata|milk/)
  })

  it('searches as you type', async () => {
    setup()
    await userEvent.click(kindRadio('Supply'))
    await userEvent.click(within(dialog()).getByRole('combobox', { name: /Supply/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'dishw')
    expect(options().filter((o) => !/^New /.test(o))).toEqual([expect.stringMatching(/^Dishwasher tablets/)])
  })

  it('offers "New Supply" for a name that matches nothing, and "New Ingredient" in the Ingredient mode', async () => {
    setup()
    await userEvent.click(within(dialog()).getByRole('combobox', { name: /Ingredient/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'tinned tomatoes')
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /New Ingredient .tinned tomatoes./ })).toBeInTheDocument()
  })

  it('a new Supply asks for a Base Unit that starts on piece; a new Ingredient starts on g', async () => {
    setup()
    await userEvent.click(kindRadio('Supply'))
    await choose(/Supply/, /New Supply .toilet paper./, 'toilet paper')
    const unit = within(dialog()).getByRole('radiogroup', { name: 'Base Unit' })
    expect(within(unit).getAllByRole('radio').map((r) => r.textContent)).toEqual(['g', 'ml', 'piece'])
    expect(within(unit).getByRole('radio', { name: 'piece' })).toBeChecked()
  })

  it('a new Ingredient starts its Base Unit on g, and a Base Unit change shows the pack chips of that unit', async () => {
    setup()
    await choose(/Ingredient/, /New Ingredient .olive oil./, 'olive oil')
    const unit = within(dialog()).getByRole('radiogroup', { name: 'Base Unit' })
    expect(within(unit).getByRole('radio', { name: 'g' })).toBeChecked()
    expect(within(packGroup()).getByRole('button', { name: '1 kg' })).toBeInTheDocument()
    await userEvent.click(within(unit).getByRole('radio', { name: 'ml' }))
    expect(within(packGroup()).getByRole('button', { name: '1 l' })).toBeInTheDocument()
    expect(within(packGroup()).queryByRole('button', { name: '1 kg' })).toBeNull()
  })

  it('an existing choice needs no Base Unit question', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    expect(within(dialog()).queryByRole('radiogroup', { name: 'Base Unit' })).toBeNull()
  })

  it('shows the chosen name in the eyebrow with its kind', async () => {
    setup()
    await userEvent.click(kindRadio('Supply'))
    await choose(/Supply/, /^Dish soap/)
    expect(within(dialog()).getByText('Dish soap · Supply')).toBeInTheDocument()
  })

  it('flipping Ingredient | Supply drops a choice of the other kind', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(kindRadio('Supply'))
    expect(within(dialog()).getByRole('combobox', { name: /Supply/ })).not.toHaveTextContent('milk')
    expect(within(dialog()).queryByText(/milk · Ingredient/)).toBeNull()
  })

  describe('the near-duplicate guard', () => {
    const roll: Ingredient = { id: 20, name: 'Toilet roll', baseUnit: 'piece', shelfLifeDays: null, conversions: [], kind: 'supply' }
    const similar = (): Promise<SearchResult> => Promise.resolve({ exact: null, suggestions: [{ ingredient: roll, score: 0.8 }] })

    it('looks a new Supply up and offers the existing one', async () => {
      const findSimilar = vi.fn(similar)
      setup({ findSimilar })
      await userEvent.click(kindRadio('Supply'))
      await choose(/Supply/, /New Supply .toilet paper./, 'toilet paper')
      expect(findSimilar).toHaveBeenCalledWith('toilet paper')
      const guard = await screen.findByRole('status')
      expect(guard).toHaveTextContent('Did you mean Toilet roll?')
      expect(within(guard).getByRole('button', { name: 'Use Toilet roll' })).toBeInTheDocument()
    })

    it('"Use Toilet roll" takes the existing Supply (id, Base Unit) and Add saves it', async () => {
      const { props } = setup({ findSimilar: vi.fn(similar) })
      await userEvent.click(kindRadio('Supply'))
      await choose(/Supply/, /New Supply .toilet paper./, 'toilet paper')
      await userEvent.click(await screen.findByRole('button', { name: 'Use Toilet roll' }))
      await userEvent.click(within(packGroup()).getByRole('button', { name: '4 pieces' }))
      await userEvent.click(addButton())
      await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
      expect(props.onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ id: 20, name: 'Toilet roll', baseUnit: 'piece' })
    })

    it('Add does not save while the guard waits for an answer', async () => {
      const { props } = setup({ findSimilar: vi.fn(similar) })
      await userEvent.click(kindRadio('Supply'))
      await choose(/Supply/, /New Supply .toilet paper./, 'toilet paper')
      await screen.findByRole('status')
      await userEvent.click(within(packGroup()).getByRole('button', { name: '4 pieces' }))
      await userEvent.click(addButton())
      expect(props.onSave).not.toHaveBeenCalled()
    })

    it('offline (no findSimilar) creates at once', async () => {
      setup()
      await userEvent.click(kindRadio('Supply'))
      await choose(/Supply/, /New Supply .toilet paper./, 'toilet paper')
      expect(screen.queryByRole('status')).toBeNull()
    })
  })
})
