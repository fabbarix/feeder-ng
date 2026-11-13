import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { garlic, milk } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import type { IngredientRef } from '../types'
import { IngredientLineRow, type IngredientLineRowProps } from './IngredientLineRow'

// BR-D: line actions in the editor: Link to a Base recipe, Use as a plain Ingredient, Needed at.
const bech: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
const plainLine: LineDraft = { key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }
const baseLine: LineDraft = { key: 'l2', ingredientId: 30, ingredientName: 'Béchamel', quantity: '500', unit: 'ml', optional: false, note: '', baseRecipeId: 3, baseRecipeName: 'Béchamel', linkedFromIngredientId: 5 }
const steps = [{ text: 'Boil the pasta', kind: 'active' as const }, { text: 'Layer the lasagne', kind: 'passive' as const }]
const props = (over: Partial<IngredientLineRowProps> = {}): IngredientLineRowProps => ({
  line: plainLine, index: 0, errors: {}, ingredient: garlic, ingredients: [garlic, milk, bech], onPick: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), ...over,
})
const view = (p: IngredientLineRowProps) => render(<ul><IngredientLineRow {...p} /></ul>)

describe('IngredientLineRow: Link to a Base recipe', () => {
  it('offers it in the actions menu of a plain line, and calls back', async () => {
    const onLinkToBase = vi.fn()
    view(props({ onLinkToBase }))
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
    expect(onLinkToBase).toHaveBeenCalledOnce()
  })
  it('is absent from the menu without the callback, and from a Base recipe line', async () => {
    const { unmount } = view(props())
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    expect(screen.queryByRole('menuitem', { name: 'Link to a Base recipe' })).toBeNull()
    unmount()
    view(props({ line: baseLine, ingredient: bech, onLinkToBase: vi.fn() }))
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
    expect(screen.queryByRole('menuitem', { name: 'Link to a Base recipe' })).toBeNull()
  })
  it('is absent on a line with no Ingredient picked yet', async () => {
    view(props({ line: { ...plainLine, ingredientId: null, ingredientName: '' }, ingredient: undefined, onLinkToBase: vi.fn() }))
    await userEvent.click(screen.getByRole('button', { name: /^Actions for/ }))
    expect(screen.queryByRole('menuitem', { name: 'Link to a Base recipe' })).toBeNull()
  })
})

describe('IngredientLineRow: a Base recipe line', () => {
  it('offers Use as a plain Ingredient and calls back', async () => {
    const onUseAsPlain = vi.fn()
    view(props({ line: baseLine, ingredient: bech, onUseAsPlain }))
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
    expect(onUseAsPlain).toHaveBeenCalledOnce()
  })
  it('shows the Base recipe badge in the Ingredient cell', () => {
    view(props({ line: baseLine, ingredient: bech }))
    expect(screen.getByText('Base recipe')).toBeInTheDocument()
  })
  it('shows the Needed at chip-menu with the Step that applies, and changes it', async () => {
    const onNeededAt = vi.fn()
    view(props({ line: { ...baseLine, neededAtStep: 1 }, ingredient: bech, steps, neededAtDefault: 1, onNeededAt }))
    await userEvent.click(screen.getByRole('button', { name: /Needed at Step 2/ }))
    await userEvent.click(screen.getByText('Before you start'))
    expect(onNeededAt).toHaveBeenCalledWith(0)
  })
  it('a plain line has no Needed at chip', () => {
    view(props({ steps }))
    expect(screen.queryByRole('button', { name: /Needed at|Before you start/ })).toBeNull()
  })
  it('sizes the Unit choices from the Base recipe\'s Ingredient', async () => {
    view(props({ line: baseLine, ingredient: bech }))
    expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveTextContent('ml')
  })
})
