// PP: the Product sheet on the Ingredient page passes the picked Picture on to create.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { strings } from '../strings'
import { IngredientProducts } from './IngredientProducts'

const hook = { products: [], isLoading: false, error: null as Error | null, create: vi.fn().mockResolvedValue({}) }
vi.mock('../hooks/useIngredientProducts', () => ({ useIngredientProducts: () => hook }))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

describe('IngredientProducts: Picture in the Product sheet', () => {
  it('creates the Product with the picked Picture', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><IngredientProducts ingredientId={3} ingredientName="tomato passata" baseUnit="g" /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: strings.newProduct }))
    await user.type(screen.getByLabelText(strings.packSizeLabel('g')), '700')
    await user.click(screen.getByRole('button', { name: `pick ${strings.pictureLabel}` }))
    await user.click(screen.getByRole('button', { name: strings.saveProduct }))
    await waitFor(() =>
      expect(hook.create).toHaveBeenCalledWith({ name: 'Tomato passata 700 g', ingredientId: 3, packSize: 700, barcodes: [], image: PICKED_ID }),
    )
  })
})
