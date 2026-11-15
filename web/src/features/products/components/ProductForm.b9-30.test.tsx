// B9-30 (SAFE-04): the Product form used alone (its own FormActions): errors at the field, focus to the first invalid one, no field alert,
// and a server failure is a FormError. (NewProductSheet.test.tsx covers the sheet around it.)
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductForm } from './ProductForm'

const setup = (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
  render(<ProductForm ingredientId={3} ingredientName="tomato passata" baseUnit="g" onSubmit={onSubmit} />)
  return { onSubmit }
}

describe('ProductForm errors', () => {
  it('Save with an empty form focuses Product name and marks name and pack size invalid', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    const name = screen.getByLabelText('Product name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(name).toHaveFocus())
    expect(screen.getByLabelText('Pack size (g)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('"123" in Barcode says to enter the 8, 12 or 13 digits', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Pack size (g)'), '700')
    await userEvent.type(screen.getByLabelText('Barcode'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    expect(screen.getByText('Enter the 8, 12 or 13 digits under the bars.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Barcode')).toHaveFocus())
  })

  it('a server failure is a FormError', async () => {
    setup(vi.fn().mockRejectedValue(new Error('That did not save.')))
    await userEvent.type(screen.getByLabelText('Pack size (g)'), '700')
    await userEvent.click(screen.getByRole('button', { name: 'Save Product' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('form-error')
  })
})
