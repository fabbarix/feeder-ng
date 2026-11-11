// R2-3 (F-05, F-01, F-04): Shelf Life is ONE NumberField "Shelf Life" (xs) with a "days" suffix; the "3 days" text above it is gone;
// Save and Clear are FormActions (Clear is the destructive action, far left, only while a Shelf Life is set).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShelfLifeEditor } from './ShelfLifeEditor'

describe('ShelfLifeEditor (R2-3)', () => {
  it('is a spinbutton labelled "Shelf Life", xs, with the unit "days" inside the field', () => {
    render(<ShelfLifeEditor days={3} onSave={() => {}} />)
    const field = screen.getByRole('spinbutton', { name: 'Shelf Life' })
    expect(field.closest('[data-size]')).toHaveAttribute('data-size', 'xs')
    expect(field.closest('.ui-field')).toHaveTextContent('days')
  })
  it('prints no second copy of the value ("3 days") and no (days) in the label', () => {
    render(<ShelfLifeEditor days={3} onSave={() => {}} />)
    expect(screen.queryByText('3 days')).toBeNull()
    expect(screen.queryByLabelText('Shelf Life (days)')).toBeNull()
  })
  it('puts Save in FormActions, Clear as its destructive action', () => {
    render(<ShelfLifeEditor days={3} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save Shelf Life' }).closest('.form-actions__primary')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Clear Shelf Life' }).closest('.form-actions__destructive')).not.toBeNull()
  })
  it('explains an empty Shelf Life as the field helper', () => {
    render(<ShelfLifeEditor days={null} onSave={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: 'Shelf Life' }).closest('.ui-field')).toHaveTextContent('No Shelf Life')
  })
})
