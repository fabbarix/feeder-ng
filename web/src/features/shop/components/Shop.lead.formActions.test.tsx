// R2-4 (DS-SHOP: the lead slot is now ListRow's `leading`, tested in LineRow.test): the sheets' buttons sit in FormActions (F-04).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExtraSheet } from './ExtraSheet'
import { TickSheet } from './TickSheet'

describe('Shop sheets use FormActions', () => {
  it('"How much?": the add-to-Stock button is the primary and "tick only" the secondary of one FormActions row', () => {
    render(<TickSheet open onClose={() => {}} name="Passata" baseUnit="g" defaultQuantity={1400} onSubmit={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const primary = dialog.querySelector('.form-actions__primary button')!
    const secondary = dialog.querySelector('.form-actions__secondary button')!
    expect(primary).toHaveAttribute('type', 'submit')
    expect(primary).toHaveAttribute('data-variant', 'primary')
    expect(secondary).toHaveAttribute('data-variant', 'secondary')
  })
  it('"Add an extra": Save is the primary of a FormActions row', () => {
    render(<ExtraSheet open onClose={() => {}} ingredients={[]} onSubmit={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save' }).closest('.form-actions__primary')).not.toBeNull()
  })
})
