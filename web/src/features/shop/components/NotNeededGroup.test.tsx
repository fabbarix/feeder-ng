import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLine, makePast } from '../testData'
import { lineEntry } from '../lib/lines'
import { NotNeededGroup } from './NotNeededGroup'

// B5-SH: the collapsed "Not needed (N)" group at the end of the list.

const passata = lineEntry(makeLine(), 'USD', 'metric')
const rice = lineEntry(makeLine({ ingredientId: 5, name: 'Rice', baseUnit: 'g', quantity: 600, pack: null, estimatedCostCents: null }), 'USD', 'metric')

describe('NotNeededGroup', () => {
  it('renders nothing without entries', () => {
    const { container } = render(<NotNeededGroup entries={[]} onNeededAfterAll={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a collapsed disclosure named "Not needed (2)"', () => {
    render(<NotNeededGroup entries={[passata, rice]} onNeededAfterAll={() => {}} />)
    const toggle = screen.getByRole('button', { name: 'Not needed (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Passata')).toBeNull()
    expect(screen.queryByRole('button', { name: /Needed after all/ })).toBeNull()
  })

  it('opens to the lines, each with its quantity and a "Needed after all" button, and closes again', async () => {
    render(<NotNeededGroup entries={[passata, rice]} onNeededAfterAll={() => {}} />)
    const toggle = screen.getByRole('button', { name: 'Not needed (2)' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const group = screen.getByRole('group', { name: 'Not needed' })
    expect(within(group).getByText('Passata')).toBeInTheDocument()
    expect(within(group).getByText('1400 g')).toBeInTheDocument()
    expect(within(group).getByText('Rice')).toBeInTheDocument()
    expect(within(group).getAllByRole('button', { name: /Needed after all/ })).toHaveLength(2)
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Rice')).toBeNull()
  })

  it('"Needed after all" calls back with the entry it belongs to', async () => {
    const onNeededAfterAll = vi.fn()
    render(<NotNeededGroup entries={[passata, rice]} onNeededAfterAll={onNeededAfterAll} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (2)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Needed after all: Rice' }))
    expect(onNeededAfterAll).toHaveBeenCalledTimes(1)
    expect(onNeededAfterAll).toHaveBeenCalledWith(rice)
  })

  it('has no tick control: a Not needed line is neither open nor ticked', async () => {
    render(<NotNeededGroup entries={[passata]} onNeededAfterAll={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(screen.queryByRole('button', { name: /^Tick/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Untick/ })).toBeNull()
  })

  it('shows the lead (the Ingredient Picture) the body passes', async () => {
    render(<NotNeededGroup entries={[passata]} onNeededAfterAll={() => {}} lead={(e) => <span data-testid="lead">{e.title}</span>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(screen.getByTestId('lead')).toHaveTextContent('Passata')
  })

  it('still names the unconfirmed past meals of a Not needed line', async () => {
    const hinted = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')
    render(<NotNeededGroup entries={[hinted]} onNeededAfterAll={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(screen.getByText('Includes Tue Dinner, not marked Cooked yet')).toBeInTheDocument()
  })

  it('is plain buttons and a group: no native select, checkbox or details element', async () => {
    const { container } = render(<NotNeededGroup entries={[passata]} onNeededAfterAll={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(container.querySelector('select, input, details')).toBeNull()
  })
})
