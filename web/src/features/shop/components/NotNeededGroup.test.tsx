import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLine, makePast } from '../testData'
import { lineEntry } from '../lib/lines'
import { NotNeededGroup } from './NotNeededGroup'

// B5-SH (DS-SHOP): the collapsed "Not needed (N)" group at the end of the list. Rows are LineRows without a tick; "Needed after all"
// is in the row sheet, which a row tap opens (onOpen).

const passata = lineEntry(makeLine(), 'USD', 'metric')
const rice = lineEntry(makeLine({ ingredientId: 5, name: 'Rice', baseUnit: 'g', quantity: 600, pack: null, estimatedCostCents: null }), 'USD', 'metric')

describe('NotNeededGroup', () => {
  it('renders nothing without entries', () => {
    const { container } = render(<NotNeededGroup entries={[]} onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a collapsed disclosure named "Not needed (2)"', () => {
    render(<NotNeededGroup entries={[passata, rice]} onOpen={() => {}} />)
    const toggle = screen.getByRole('button', { name: 'Not needed (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Passata')).toBeNull()
  })

  it('opens to a list of rows with their quantity, and closes again', async () => {
    render(<NotNeededGroup entries={[passata, rice]} onOpen={() => {}} />)
    const toggle = screen.getByRole('button', { name: 'Not needed (2)' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('list', { name: 'Not needed' })
    expect(within(list).getByText('Passata')).toBeInTheDocument()
    expect(within(list).getByText('1400 g')).toBeInTheDocument()
    expect(within(list).getByText('Rice')).toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')[0]).toHaveAttribute('data-state', 'not-needed')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Rice')).toBeNull()
  })

  it('a row tap calls onOpen with the entry and "not-needed"; there is no "Needed after all" button on the row', async () => {
    const onOpen = vi.fn()
    render(<NotNeededGroup entries={[passata, rice]} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (2)' }))
    expect(screen.queryByRole('button', { name: /Needed after all/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Rice' }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(rice, 'not-needed')
  })

  it('has no tick control: a Not needed line is neither open nor ticked', async () => {
    render(<NotNeededGroup entries={[passata]} onOpen={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(screen.queryByRole('button', { name: /^(Tick|Untick)/ })).toBeNull()
  })

  it('shows the monogram Thumb of each Line', async () => {
    const { container } = render(<NotNeededGroup entries={[passata]} onOpen={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(container.querySelector('.thumb__monogram')).toHaveTextContent('P')
  })

  it('names the unconfirmed past meals of a Not needed line with the short info marker', async () => {
    const hinted = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')
    render(<NotNeededGroup entries={[hinted]} onOpen={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(screen.getByText('Tue Dinner')).toBeInTheDocument()
  })

  it('is plain buttons and a list: no native select, checkbox or details element', async () => {
    const { container } = render(<NotNeededGroup entries={[passata]} onOpen={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(container.querySelector('select, input, details')).toBeNull()
  })
})
