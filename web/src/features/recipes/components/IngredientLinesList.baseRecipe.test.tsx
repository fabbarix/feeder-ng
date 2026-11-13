import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import type { IngredientRef, RecipeLine } from '../types'
import { IngredientLinesList, type IngredientLinesListProps } from './IngredientLinesList'

// BR-D: the detail's lines. A Base recipe line reads "500 ml Béchamel (Base recipe)", the name linking to the Base recipe.
const bech: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
const plain: RecipeLine = { id: 1, ingredientId: 5, ingredient: 'béchamel', quantity: 500, unit: 'ml', optional: false, note: '' }
const based = (over: Partial<RecipeLine> = {}): RecipeLine => ({
  id: 2, ingredientId: 30, ingredient: 'Béchamel', quantity: 500, unit: 'ml', optional: false, note: '', baseRecipe: { id: 3, name: 'Béchamel', archived: false }, neededAt: 0, linkedFromIngredientId: 5, ...over,
})
const refs = new Map<number, IngredientRef>([[7, garlic], [30, bech], [5, { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }]])
const view = (lines: RecipeLine[], over: Partial<IngredientLinesListProps> = {}) =>
  render(<MemoryRouter><IngredientLinesList lines={lines} refs={refs} system="metric" {...over} /></MemoryRouter>)

describe('IngredientLinesList: Base recipe lines', () => {
  it('reads "500 ml Béchamel (Base recipe)" with the name a link to the Base recipe', () => {
    view([based()])
    const row = screen.getByRole('link', { name: 'Béchamel' }).closest('div') as HTMLElement
    expect(screen.getByRole('link', { name: 'Béchamel' })).toHaveAttribute('href', '/recipes/3')
    expect(row).toHaveTextContent('500 ml Béchamel (Base recipe)')
  })
  it('says "No Ingredients yet" for an empty Base recipe', () => {
    view([based({ baseRecipe: { id: 3, name: 'Béchamel', archived: false, empty: true } })])
    expect(screen.getByText('No Ingredients yet')).toBeInTheDocument()
  })
  it('says "(Base recipe, archived)" for an archived one', () => {
    view([based({ baseRecipe: { id: 3, name: 'Béchamel', archived: true } })])
    expect(screen.getByText(/Béchamel \(Base recipe, archived\)/)).toBeInTheDocument()
  })
  it('leaves a plain line as it was: no link, no badge', () => {
    view([plain])
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/Base recipe/)).toBeNull()
  })
})

describe('IngredientLinesList: line actions on the detail', () => {
  it('Link to a Base recipe on a plain line', async () => {
    const onLinkToBase = vi.fn()
    view([plain], { onLinkToBase })
    await userEvent.click(screen.getByRole('button', { name: 'Actions for béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
    expect(onLinkToBase).toHaveBeenCalledWith(plain)
  })
  it('Use as a plain Ingredient on a Base recipe line', async () => {
    const onUseAsPlain = vi.fn()
    const line = based()
    view([line], { onUseAsPlain })
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
    expect(onUseAsPlain).toHaveBeenCalledWith(line)
  })
  it('shows each action only on the kind of line it applies to', async () => {
    view([plain, based()], { onLinkToBase: vi.fn(), onUseAsPlain: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: 'Actions for béchamel' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Link to a Base recipe' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Use as a plain Ingredient' })).toBeNull()
  })
  it('has no actions menu when the screen gives no callbacks', () => {
    view([plain])
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
  })
})
