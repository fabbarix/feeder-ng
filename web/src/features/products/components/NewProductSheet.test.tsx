// B9-30 (SET-14a, SHORT-02, SAFE-04): the New Product sheet, shared by the Products list and an Ingredient's Products tile.
// API pinned (features/products/components/NewProductSheet.tsx):
//   <NewProductSheet open onClose ingredient?: { id, name, baseUnit } onSubmit(body: NewProduct): Promise<void> />
//   - Without `ingredient` (the Products list) the first control is a crafted Select "Ingredient" (every Ingredient, food and Supplies, from
//     GET /api/ingredients); choosing it sets the pack size unit ("Pack size (g)") and the name prefill. With `ingredient` (an Ingredient's
//     page) there is no such Select, as today.
//   - the footer is the sheet's: outline Cancel and the primary "Save Product" bound to the form; so no Close and no second Save in the body.
//   - errors at the field with focus to the first invalid one (Ingredient, Product name, Pack size, Barcode); a server failure that belongs
//     to no field is a FormError; a 400 invalid_barcode is the Barcode field's error.
// ProductForm (the body) gains `formId?: string` and `hideActions?: boolean`; its own FormActions stay when it is used alone.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { NewProductSheet } from './NewProductSheet'

afterEach(() => vi.unstubAllGlobals())

const ingredients = [
  { id: 3, name: 'tomato passata', baseUnit: 'g', kind: 'food', shelfLifeDays: null, conversions: [] },
  { id: 8, name: 'dishwasher tablets', baseUnit: 'piece', kind: 'supply', shelfLifeDays: null, conversions: [] },
]
function setup(props: { ingredient?: { id: number; name: string; baseUnit: 'g' | 'ml' | 'piece' }; onSubmit?: (b: unknown) => Promise<void> } = {}) {
  const api = mockApi({ 'GET /api/ingredients': ingredients, 'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' } })
  const onSubmit = vi.fn(props.onSubmit ?? (() => Promise.resolve()))
  const onClose = vi.fn()
  renderWithProviders(<NewProductSheet open onClose={onClose} ingredient={props.ingredient} onSubmit={onSubmit} />)
  return { api, onSubmit, onClose }
}
const dialog = () => screen.getByRole('dialog', { name: 'New Product' })
const ingredientSelect = () => screen.findByRole('combobox', { name: 'Ingredient' })
const pickIngredient = async (name: RegExp | string) => {
  await userEvent.click(await ingredientSelect())
  await userEvent.click(await screen.findByRole('option', { name }))
}

describe('Ingredient first (SET-14a)', () => {
  it('the first control is the Ingredient Select, and it has focus', async () => {
    setup()
    const select = await ingredientSelect()
    await waitFor(() => expect(select).toHaveFocus())
    expect(dialog().querySelector('select')).toBeNull()
  })

  it('lists food and Supplies', async () => {
    setup()
    await userEvent.click(await ingredientSelect())
    expect(await screen.findByRole('option', { name: /Tomato passata/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Dishwasher tablets/i })).toBeInTheDocument()
  })

  it('choosing an Ingredient sets the pack size unit and creates the Product with that Ingredient', async () => {
    const { onSubmit } = setup()
    await pickIngredient(/Tomato passata/i)
    await userEvent.type(screen.getByLabelText('Pack size (g)'), '700')
    expect(screen.getByLabelText('Product name')).toHaveValue('Tomato passata 700 g')
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Tomato passata 700 g', ingredientId: 3, packSize: 700, barcodes: [] }))
  })

  it('with an Ingredient given there is no Ingredient Select', async () => {
    setup({ ingredient: { id: 3, name: 'tomato passata', baseUnit: 'g' } })
    await screen.findByLabelText('Product name')
    expect(screen.queryByRole('combobox', { name: 'Ingredient' })).toBeNull()
    expect(screen.getByLabelText('Pack size (g)')).toBeInTheDocument()
  })
})

describe('footer', () => {
  it('has an outline Cancel and one primary Save Product, and no Close', async () => {
    const { onClose } = setup()
    await ingredientSelect()
    const d = dialog()
    expect(within(d).queryByRole('button', { name: /^close$/i })).toBeNull()
    expect(within(d).getAllByRole('button', { name: 'Save Product' })).toHaveLength(1)
    const cancel = within(d).getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(cancel)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('errors at the field (SAFE-04)', () => {
  it('Save with nothing: the Ingredient is invalid, focused and described; Save stays enabled; no alert', async () => {
    const { onSubmit } = setup()
    const save = await screen.findByRole('button', { name: 'Save Product' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    const select = await ingredientSelect()
    expect(select).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(select).toHaveFocus())
    const message = within(dialog()).getByText('Choose an Ingredient.')
    expect(select.getAttribute('aria-describedby') ?? '').toContain(message.id)
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('with the Ingredient fixed the first invalid field is Product name, then Pack size', async () => {
    setup({ ingredient: { id: 3, name: 'tomato passata', baseUnit: 'g' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Save Product' }))
    const name = screen.getByLabelText('Product name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(name).toHaveFocus())
    expect(screen.getByLabelText('Pack size (g)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Give the Product a name.')).toBeInTheDocument()
    expect(screen.getByText('Pack size must be a number above zero.')).toBeInTheDocument()
  })

  it('a mistyped barcode is the Barcode field\'s error with the new copy', async () => {
    const { onSubmit } = setup({ ingredient: { id: 3, name: 'tomato passata', baseUnit: 'g' } })
    await userEvent.type(await screen.findByLabelText('Pack size (g)'), '700')
    await userEvent.type(screen.getByLabelText('Barcode'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    expect(await screen.findByText('Enter the 8, 12 or 13 digits under the bars.')).toBeInTheDocument()
    expect(screen.getByLabelText('Barcode')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(screen.getByLabelText('Barcode')).toHaveFocus())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('the server\'s invalid_barcode lands on the Barcode field', async () => {
    setup({ ingredient: { id: 3, name: 'tomato passata', baseUnit: 'g' }, onSubmit: () => Promise.reject(new ApiError(400, 'invalid_barcode', 'barcode must have 8, 12, 13 or 14 digits')) })
    await userEvent.type(await screen.findByLabelText('Pack size (g)'), '700')
    await userEvent.type(screen.getByLabelText('Barcode'), '4006381333931')
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    expect(await screen.findByText('Enter the 8, 12 or 13 digits under the bars.')).toBeInTheDocument()
    expect(screen.getByLabelText('Barcode')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog()).queryByRole('alert')).toBeNull()
  })

  it('a server failure that belongs to no field is a FormError', async () => {
    setup({ ingredient: { id: 3, name: 'tomato passata', baseUnit: 'g' }, onSubmit: () => Promise.reject(new Error('A Product with that name exists.')) })
    await userEvent.type(await screen.findByLabelText('Pack size (g)'), '700')
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(alert).toHaveTextContent('A Product with that name exists.')
    expect(document.querySelector('.pg__error')).toBeNull()
  })
})
