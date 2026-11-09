import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { strings } from '../strings'
import type { Product } from '../types'
import { IngredientProducts } from './IngredientProducts'

const mutti: Product = { id: 1, name: 'Mutti passata 700 g', ingredientId: 3, ingredientName: 'tomato passata', baseUnit: 'g', packSize: 700 }
const hook = {
  products: [mutti] as Product[],
  isLoading: false,
  error: null as Error | null,
  create: vi.fn(),
}
vi.mock('../hooks/useIngredientProducts', () => ({ useIngredientProducts: () => hook }))

function renderIt() {
  return render(
    <MemoryRouter>
      <IngredientProducts ingredientId={3} ingredientName="tomato passata" baseUnit="g" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  hook.products = [mutti]
  hook.create.mockReset().mockResolvedValue({})
})

describe('IngredientProducts', () => {
  it('lists the Products with their pack size and links to each', () => {
    renderIt()
    const link = screen.getByRole('link', { name: /Mutti passata 700 g/ })
    expect(link).toHaveAttribute('href', '/products/1')
    expect(screen.getByText('700 g')).toBeInTheDocument()
  })

  it('shows an empty state when the Ingredient has no Products', () => {
    hook.products = []
    renderIt()
    expect(screen.getByText(strings.ingredientProductsEmpty)).toBeInTheDocument()
  })

  it('creates a Product from a sheet, naming it after the Ingredient and pack size', async () => {
    const user = userEvent.setup()
    renderIt()
    await user.click(screen.getByRole('button', { name: strings.newProduct }))
    const dialog = screen.getByRole('dialog')
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    expect(screen.getByLabelText(strings.nameLabel)).toHaveValue('Tomato passata 700 g')
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    await waitFor(() =>
      expect(hook.create).toHaveBeenCalledWith({ name: 'Tomato passata 700 g', ingredientId: 3, packSize: 700, barcodes: [] }),
    )
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('stops following the pack size once the name was edited by hand', async () => {
    const user = userEvent.setup()
    renderIt()
    await user.click(screen.getByRole('button', { name: strings.newProduct }))
    await user.type(screen.getByLabelText(strings.nameLabel), 'Mutti')
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    expect(screen.getByLabelText(strings.nameLabel)).toHaveValue('Mutti')
  })

  it('sends the barcode when one is given', async () => {
    const user = userEvent.setup()
    renderIt()
    await user.click(screen.getByRole('button', { name: strings.newProduct }))
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    await user.type(screen.getByLabelText(strings.barcodeLabel), '8001234567897')
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    await waitFor(() => expect(hook.create).toHaveBeenCalled())
    expect(hook.create.mock.calls[0]![0].barcodes).toEqual(['8001234567897'])
  })

  it('does not submit an invalid form and says why', async () => {
    const user = userEvent.setup()
    renderIt()
    await user.click(screen.getByRole('button', { name: strings.newProduct }))
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    expect(screen.getByText(strings.errNameRequired)).toBeInTheDocument()
    expect(screen.getByText(strings.errPackSize)).toBeInTheDocument()
    expect(hook.create).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps the sheet open', async () => {
    hook.create.mockRejectedValue(new ApiError(409, 'barcode_taken', 'barcode already belongs to product 7'))
    const user = userEvent.setup()
    renderIt()
    await user.click(screen.getByRole('button', { name: strings.newProduct }))
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    await user.type(screen.getByLabelText(strings.barcodeLabel), '8001234567897')
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    expect(await screen.findByRole('alert')).toHaveTextContent('barcode already belongs to product 7')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
