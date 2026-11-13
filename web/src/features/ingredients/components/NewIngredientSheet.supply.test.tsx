// H5: the New Ingredient sheet: a Food | Supply Segmented where both are allowed; a Supply hides Shelf Life and shows Restock level.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { dishSoapJSON, garlicJSON } from '../supply.test-helper'
import type { SearchResult } from '../types'
import { NewIngredientSheet, type NewIngredientSheetProps } from './NewIngredientSheet'

const none: SearchResult = { exact: null, suggestions: [] }
function setup(over: Partial<NewIngredientSheetProps> = {}) {
  const props: NewIngredientSheetProps = {
    open: true,
    onClose: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(dishSoapJSON),
    findSimilar: vi.fn().mockResolvedValue(none),
    chooseKind: true,
    ...over,
  }
  render(<NewIngredientSheet {...props} />)
  return props
}
const kindGroup = () => screen.getByRole('radiogroup', { name: 'Kind' })
const name = () => screen.getByLabelText('Name')
const shelfLife = () => screen.queryByLabelText(/Shelf Life/)
const restock = () => screen.queryByRole('textbox', { name: /Restock level/ })

describe('NewIngredientSheet: the kind choice', () => {
  it('opens on Food with a Segmented Food | Supply, and no Restock level', () => {
    setup()
    const group = kindGroup()
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Food', 'Supply'])
    expect(within(group).getByRole('radio', { name: 'Food' })).toBeChecked()
    expect(shelfLife()).toBeInTheDocument()
    expect(restock()).toBeNull()
  })
  it('a Supply hides Shelf Life and shows Restock level with the Base Unit as its unit', async () => {
    setup()
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    expect(shelfLife()).toBeNull()
    expect(screen.queryByText('Leave blank if it keeps.')).toBeNull()
    expect(restock()).toBeInTheDocument()
    expect(restock()).toHaveAccessibleDescription(/Shopping List/)
  })
  it('a Supply defaults the Base Unit to piece; going back to Food keeps the unit the User last chose', async () => {
    setup()
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    expect(screen.getByRole('radio', { name: 'piece' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'ml' }))
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Food' }))
    expect(screen.getByRole('radio', { name: 'ml' })).toBeChecked()
    expect(shelfLife()).toBeInTheDocument()
    expect(restock()).toBeNull()
  })
  it('asks for a Supply\'s name in Supply words', async () => {
    setup({ chooseKind: false, kind: 'supply' })
    await userEvent.click(screen.getByRole('button', { name: 'Create Supply' }))
    expect(name()).toHaveAccessibleDescription(/Give the Supply a name/)
  })
  it('is fixed to food when nobody asks for the choice (the Recipe editor opens it with no kind props)', () => {
    render(<NewIngredientSheet open onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'New Ingredient' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Shelf Life/)).toBeInTheDocument()
  })
  it('the choice starts on the given kind (Scan, Pantry and Shop extras can start on Supply)', () => {
    setup({ kind: 'supply' })
    expect(within(kindGroup()).getByRole('radio', { name: 'Supply' })).toBeChecked()
    expect(shelfLife()).toBeNull()
  })
  it('does not offer the choice when the kind is fixed (a catalogue list)', () => {
    setup({ kind: 'food', chooseKind: false })
    expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull()
    expect(shelfLife()).toBeInTheDocument()
  })
  it('a fixed Supply titles the sheet "New Supply", hides Shelf Life and says "Create Supply"', () => {
    setup({ kind: 'supply', chooseKind: false })
    expect(screen.getByRole('dialog', { name: 'New Supply' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull()
    expect(shelfLife()).toBeNull()
    expect(screen.getByRole('button', { name: 'Create Supply' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'piece' })).toBeChecked()
  })
})

describe('NewIngredientSheet: the body it sends', () => {
  it('sends kind food and no restockLevel for food', async () => {
    const p = setup()
    await userEvent.type(name(), 'saffron')
    await userEvent.type(screen.getByLabelText(/Shelf Life/), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Create Ingredient' }))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'saffron', baseUnit: 'g', shelfLifeDays: 90, kind: 'food' })
  })
  it('sends kind supply, the Restock level and no shelfLifeDays for a Supply', async () => {
    const p = setup()
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    await userEvent.type(name(), 'Dish soap')
    await userEvent.click(screen.getByRole('radio', { name: 'ml' }))
    await userEvent.type(restock()!, '500{Enter}')
    await userEvent.click(screen.getByRole('button', { name: /^Create/ }))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'Dish soap', baseUnit: 'ml', kind: 'supply', restockLevel: 500 })
  })
  it('leaves restockLevel out when none is typed', async () => {
    const p = setup({ kind: 'supply', chooseKind: false })
    await userEvent.type(name(), 'bin bags')
    await userEvent.click(screen.getByRole('button', { name: 'Create Supply' }))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'bin bags', baseUnit: 'piece', kind: 'supply' })
  })
  it('drops a Shelf Life typed before switching to Supply', async () => {
    const p = setup()
    await userEvent.type(name(), 'candles')
    await userEvent.type(screen.getByLabelText(/Shelf Life/), '30')
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    await userEvent.click(screen.getByRole('button', { name: /^Create/ }))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'candles', baseUnit: 'piece', kind: 'supply' })
  })
  it('a fixed food kind is sent as food', async () => {
    const p = setup({ chooseKind: false, kind: 'food', initialName: 'saffron' })
    await userEvent.click(screen.getByRole('button', { name: 'Create Ingredient' }))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'saffron', baseUnit: 'g', kind: 'food' })
  })
  it('refuses a Restock level of 0 with the amount message and sends nothing', async () => {
    const p = setup({ chooseKind: false, kind: 'supply', initialName: 'bin bags' })
    await userEvent.type(restock()!, '0{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Create Supply' }))
    expect(p.onCreate).not.toHaveBeenCalled()
  })
  it('shows a server refusal in words (422 supply_has_shelf_life)', async () => {
    const p = setup({ chooseKind: false, kind: 'supply', initialName: 'bin bags', onCreate: vi.fn().mockRejectedValue(new ApiError(422, 'validation_failed', 'x', { reason: 'supply_has_shelf_life' })) })
    await userEvent.click(screen.getByRole('button', { name: 'Create Supply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A Supply has no Shelf Life')
    expect(p.onClose).not.toHaveBeenCalled()
  })
})

describe('NewIngredientSheet: the near-duplicate lookup stays inside the kind', () => {
  it('asks findSimilar for food by default, so a Supply is never offered as "Use ..." (default lookup: ingredientsApi.search)', async () => {
    const api = await import('../api')
    const search = vi.spyOn(api.ingredientsApi, 'search').mockResolvedValue({ exact: null, suggestions: [] })
    const onCreate = vi.fn().mockResolvedValue(garlicJSON)
    render(<NewIngredientSheet open onClose={vi.fn()} onCreate={onCreate} kind="food" initialName="saffron" />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Ingredient' }))
    expect(search).toHaveBeenCalledWith('saffron', undefined, 'food')
    search.mockRestore()
  })
  it('asks for supplies when the chosen kind is Supply', async () => {
    const api = await import('../api')
    const search = vi.spyOn(api.ingredientsApi, 'search').mockResolvedValue({ exact: null, suggestions: [] })
    render(<NewIngredientSheet open chooseKind onClose={vi.fn()} onCreate={vi.fn().mockResolvedValue(dishSoapJSON)} initialName="soap" />)
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    await userEvent.click(screen.getByRole('button', { name: /^Create/ }))
    expect(search).toHaveBeenCalledWith('soap', undefined, 'supply')
    search.mockRestore()
  })
})

describe('NewIngredientSheet: a11y', () => {
  it('names the kind group, helps the Restock level, and uses no native select', async () => {
    setup()
    expect(kindGroup()).toBeInTheDocument()
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    expect(document.querySelector('select')).toBeNull()
    expect(restock()).toHaveAccessibleName(/Restock level/)
  })
  it('moves focus along the kind Segmented with the arrow keys', async () => {
    setup()
    within(kindGroup()).getByRole('radio', { name: 'Food' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(kindGroup()).getByRole('radio', { name: 'Supply' })).toBeChecked()
  })
})
