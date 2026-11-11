// R2-3 (F-01, F-04; guard P4 "Pack size"): the Product form sizes its fields and keeps Save in FormActions.
//   Product name lg . Pack size sm (the Base Unit as a suffix inside the field) . Barcode md . "Save Product" = FormActions primary.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProductForm } from './ProductForm'

const sizeOf = (el: HTMLElement) => el.closest('[data-size]')?.getAttribute('data-size')
const setup = () => render(<ProductForm ingredientId={3} ingredientName="tomato passata" baseUnit="g" onSubmit={vi.fn()} />)

describe('ProductForm (R2-3)', () => {
  it('sizes the fields to their values', () => {
    setup()
    expect(sizeOf(screen.getByLabelText('Product name'))).toBe('lg')
    expect(sizeOf(screen.getByLabelText('Pack size (g)'))).toBe('sm')
    expect(sizeOf(screen.getByLabelText('Barcode'))).toBe('md')
  })
  it('puts Save Product in FormActions', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save Product' }).closest('.form-actions__primary')).not.toBeNull()
  })
})
