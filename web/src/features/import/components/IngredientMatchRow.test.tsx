// B9-28 (RX-12): an Ingredient of the file as an R-E row with its answer. It replaces IngredientMatchTile and UnitPromptTile.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { match, prompt } from '../fixtures.test-helper'
import type { IngredientMatch, UnitPrompt } from '../types'
import { IngredientMatchRow } from './IngredientMatchRow'

const show = (m: IngredientMatch, p?: UnitPrompt) => {
  const on = { onUseExisting: vi.fn(), onCreate: vi.fn(), onAnswerConversion: vi.fn() }
  const view = render(<IngredientMatchRow match={m} prompt={p} {...on} />)
  return { ...on, ...view }
}
const suggested = match({
  key: 'chicken thighs', name: 'chicken thighs', status: 'suggested', suggestions: [{ id: 5, name: 'Chicken', baseUnit: 'g', score: 0.8 }],
  effective: { key: 'chicken thighs', action: 'create' },
})

describe('IngredientMatchRow', () => {
  it('is a row: the display name as key, the state at the end, the detail muted under it', () => {
    show(suggested)
    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Chicken thighs')).toBeInTheDocument()
    expect(within(row).getByText('Create new')).toBeInTheDocument()
    expect(within(row).getByText('Similar to Chicken')).toBeInTheDocument()
  })
  it('is never a tall tile with a title-2 name and never a status chip', () => {
    const { container } = show(suggested)
    expect(container.querySelector('.tile')).toBeNull()
    expect(container.querySelector('.chip[data-kind="status"]')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  describe('suggested', () => {
    it('offers "Use Chicken" and "Create Chicken thighs" as pressable chips, the answer in force pressed', () => {
      show(suggested)
      expect(screen.getByRole('button', { name: 'Create Chicken thighs' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Use Chicken' })).toHaveAttribute('aria-pressed', 'false')
    })
    it('answers Use with the suggestion and Create with no options', async () => {
      const { onUseExisting, onCreate } = show(suggested)
      await userEvent.click(screen.getByRole('button', { name: 'Use Chicken' }))
      expect(onUseExisting).toHaveBeenCalledWith(5)
      await userEvent.click(screen.getByRole('button', { name: 'Create Chicken thighs' }))
      expect(onCreate).toHaveBeenCalledWith()
    })
  })

  describe('new', () => {
    it('reads New with its Base unit and has no answer controls', () => {
      show(match({ key: 'saffron', name: 'saffron', status: 'new', definition: { name: 'saffron', baseUnit: 'g' } }))
      expect(screen.getByText('New')).toBeInTheDocument()
      expect(screen.getByText('Base Unit g')).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('undefined', () => {
    const m = match({ key: 'flour', name: 'flour', status: 'undefined', resolved: false, effective: undefined })
    it('asks for the base unit with g, ml and piece chips, as a question in the info tone', () => {
      show(m)
      const row = screen.getByRole('listitem')
      expect(within(row).getByText('1 question')).toBeInTheDocument()
      expect(within(row).getByText('Choose its Base Unit')).toBeInTheDocument()
      for (const u of ['g', 'ml', 'piece']) expect(within(row).getByRole('button', { name: u })).toHaveAttribute('aria-pressed', 'false')
    })
    it('answers with the chosen base unit', async () => {
      const { onCreate } = show(m)
      await userEvent.click(screen.getByRole('button', { name: 'ml' }))
      expect(onCreate).toHaveBeenCalledWith({ baseUnit: 'ml' })
    })
  })

  describe('conflict', () => {
    const m = match({
      key: 'milk', name: 'milk', status: 'conflict', resolved: false, effective: undefined,
      match: { id: 3, name: 'Milk', baseUnit: 'ml' }, conflict: { file: 'g', existing: 'ml' },
    })
    it('says both base units and offers Use <existing>, a name field and a secondary Create', async () => {
      const { onUseExisting, onCreate } = show(m)
      expect(screen.getByText('In g here, in ml in your Ingredients')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Use Milk' }))
      expect(onUseExisting).toHaveBeenCalledWith(3)
      const create = screen.getByRole('button', { name: 'Create' })
      expect(create).toHaveAttribute('data-variant', 'secondary')
      expect(create).toBeDisabled()
      await userEvent.type(screen.getByRole('textbox', { name: 'New name' }), 'Milk (file)')
      await userEvent.click(create)
      expect(onCreate).toHaveBeenCalledWith({ name: 'Milk (file)' })
    })
  })

  describe('a unit question on its Ingredient', () => {
    const m = match({ key: 'garam masala', name: 'garam masala', status: 'new', definition: { name: 'garam masala', baseUnit: 'g' } })
    const q = prompt({ key: 'garam masala', ingredient: 'garam masala', unit: 'tbsp', base: 'g' })
    it('sits on the row of its Ingredient, with the question as detail', () => {
      show(m, q)
      const row = screen.getByRole('listitem')
      expect(within(row).getByText('1 question')).toBeInTheDocument()
      expect(within(row).getByText('How many g is 1 tbsp?')).toBeInTheDocument()
    })
    it('asks in an xs number field "1 tbsp of Garam masala is" with its base unit as suffix, and answers with the number', async () => {
      const { onAnswerConversion } = show(m, q)
      const field = screen.getByRole('spinbutton', { name: '1 tbsp of Garam masala is' })
      expect(field.closest('.ui-field')).toHaveTextContent('g')
      await userEvent.type(field, '6')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(onAnswerConversion).toHaveBeenCalledWith('tbsp', 6)
    })
    it('keeps Save disabled for a value that is not a positive number', async () => {
      show(m, q)
      const field = screen.getByRole('spinbutton', { name: '1 tbsp of Garam masala is' })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      await userEvent.type(field, '0')
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })
  })

  it('says it adds a Picture, on the Ingredient that receives it', () => {
    show(match({ key: 'garlic', name: 'garlic', status: 'new', addsImage: true, match: { id: 4, name: 'Garlic', baseUnit: 'piece' }, definition: { name: 'garlic', baseUnit: 'piece' } }))
    expect(screen.getByText('Adds a Picture to Garlic')).toBeInTheDocument()
  })
})
