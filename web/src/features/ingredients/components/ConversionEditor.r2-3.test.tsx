// R2-3 (F-01, F-04; guard P4 "Amount in g"): the add form is one FieldRow: Unit (sm) and "Amount in g" (sm) with the Add button
// aligned to the controls. The error appears only after Add (it already does), as an alert.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConversionEditor } from './ConversionEditor'

const setup = () => render(<ConversionEditor conversions={[]} base="g" system="metric" onAdd={vi.fn()} onRemove={vi.fn()} />)

describe('ConversionEditor add form (R2-3)', () => {
  it('sizes Unit and Amount in g to sm (not full width)', () => {
    setup()
    expect(screen.getByLabelText('Unit').closest('[data-size]')).toHaveAttribute('data-size', 'sm')
    expect(screen.getByLabelText('Amount in g').closest('[data-size]')).toHaveAttribute('data-size', 'sm')
  })
  it('lays Unit, Amount and the Add button on one FieldRow, aligned to the controls', () => {
    setup()
    const row = screen.getByLabelText('Unit').closest('.field-row')
    expect(row).not.toBeNull()
    expect(row).toHaveAttribute('data-align', 'end')
    expect(row).toContainElement(screen.getByLabelText('Amount in g'))
    expect(row).toContainElement(screen.getByRole('button', { name: 'Add conversion' }))
  })
  it('shows no error before the first Add, and an alert after an empty Add', async () => {
    setup()
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Add conversion' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
