// R2-4: the Shopping List tile has a lead slot (pictures later), and the sheets' buttons sit in FormActions (F-04).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { lineEntry } from '../lib/lines'
import { makeLine } from '../testData'
import { ExtraSheet } from './ExtraSheet'
import { LineTile } from './LineTile'
import { TickSheet } from './TickSheet'

describe('LineTile lead slot', () => {
  const entry = lineEntry(makeLine(), 'USD', 'metric')
  it('renders `lead` in .line-tile__lead, after the tick control and before the text', () => {
    const { container } = render(<LineTile entry={entry} lead={<img alt="" data-testid="pic" src="x.png" />} onTick={() => {}} onUntick={() => {}} />)
    const lead = container.querySelector('.line-tile__lead')!
    expect(lead).toContainElement(screen.getByTestId('pic'))
    const tick = screen.getByRole('button', { name: 'Tick Passata' })
    const body = container.querySelector('.line-tile__body')!
    expect(tick.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lead.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('has no lead element without `lead`', () => {
    const { container } = render(<LineTile entry={entry} onTick={() => {}} onUntick={() => {}} />)
    expect(container.querySelector('.line-tile__lead')).toBeNull()
  })
})

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
