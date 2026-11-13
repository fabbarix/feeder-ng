// DS-SHOP: the sheet a row opens: what the Line is (quantity, pack, estimated cost, the full "not marked Cooked yet" sentence)
// and the rare actions (Mark it, Not needed, Needed after all, Delete). The tick stays on the row.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { extraEntry, lineEntry } from '../lib/lines'
import { makeExtra, makeLine, makePast } from '../testData'
import { LineSheet } from './LineSheet'

const passata = lineEntry(makeLine(), 'USD', 'metric')
const hinted = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')

describe('LineSheet', () => {
  it('renders nothing without an entry', () => {
    const { container } = render(<LineSheet entry={null} actions={[]} onAction={() => {}} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a dialog named after the Line, with its quantity, pack and estimated cost', () => {
    render(<LineSheet entry={passata} actions={['not-needed']} onAction={() => {}} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Passata' })
    expect(within(dialog).getByText('1400 g')).toBeInTheDocument()
    expect(within(dialog).getByText('2 × Mutti 700 g')).toBeInTheDocument()
    expect(within(dialog).getByText('$3.18')).toBeInTheDocument()
  })

  it('says "No Price yet" for a Line without one (never a dash or $0.00)', () => {
    const e = lineEntry(makeLine({ estimatedCostCents: null }), 'USD', 'metric')
    render(<LineSheet entry={e} actions={[]} onAction={() => {}} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('No Price yet')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('—')
    expect(dialog).not.toHaveTextContent('$0.00')
  })

  it('says the full sentence about unconfirmed past meals, once, here', () => {
    render(<LineSheet entry={hinted} actions={['mark-it', 'not-needed']} onAction={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Includes Tue Dinner, not marked Cooked yet')).toBeInTheDocument()
  })

  it.each([
    ['mark-it', 'Mark it'],
    ['not-needed', 'Not needed'],
    ['needed-after-all', 'Needed after all'],
  ] as const)('the "%s" action is a button "%s" that calls onAction with its id', async (id, name) => {
    const onAction = vi.fn()
    render(<LineSheet entry={hinted} actions={[id]} onAction={onAction} onClose={() => {}} />)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith(id)
  })

  it('Delete names the extra ("Delete toilet paper")', async () => {
    const onAction = vi.fn()
    render(<LineSheet entry={extraEntry(makeExtra(), 'metric')} actions={['delete']} onAction={onAction} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete toilet paper' }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith('delete')
  })

  it('offers only the actions it is given, and none of them is the one primary action (that is Scan)', () => {
    render(<LineSheet entry={passata} actions={['mark-it', 'not-needed']} onAction={() => {}} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Needed after all' })).toBeNull()
    expect(dialog.querySelectorAll('button[data-variant="primary"]')).toHaveLength(0)
  })

  it('Close calls onClose', async () => {
    const onClose = vi.fn()
    render(<LineSheet entry={passata} actions={[]} onAction={() => {}} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
