import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MAX_BATCHES } from '../lib/cookEntry'
import { CookEntry } from './CookEntry'

const props = () => ({ batches: 2, onBatchesChange: vi.fn(), yieldValue: 4, onStart: vi.fn() })

describe('CookEntry', () => {
  it('chooses the Batch count with a Stepper', async () => {
    const p = props()
    render(<CookEntry {...p} />)
    expect(screen.getByRole('spinbutton', { name: 'Batches' })).toHaveAttribute('aria-valuenow', '2')
    await userEvent.click(screen.getByRole('button', { name: 'Increase Batches' }))
    expect(p.onBatchesChange).toHaveBeenCalledWith(3)
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Batches' }))
    expect(p.onBatchesChange).toHaveBeenCalledWith(1)
  })
  it('cannot go below one Batch or above the maximum', () => {
    const { rerender } = render(<CookEntry {...props()} batches={1} />)
    expect(screen.getByRole('button', { name: 'Decrease Batches' })).toBeDisabled()
    rerender(<CookEntry {...props()} batches={MAX_BATCHES} />)
    expect(screen.getByRole('button', { name: 'Increase Batches' })).toBeDisabled()
  })
  it('says what the Batches make', () => {
    render(<CookEntry {...props()} batches={2} yieldValue={4} />)
    expect(screen.getByText('2 Batches · 8 portions')).toBeInTheDocument()
  })
  it('starts Cook Mode', async () => {
    const p = props()
    render(<CookEntry {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(p.onStart).toHaveBeenCalledOnce()
  })
})

// RX-06: the hint states the Yield with its unit, in the User's display units, through the same formatter as the Ingredient lines.
describe('CookEntry: the hint of a Base recipe (RX-06)', () => {
  it('says "1 Batch · 800 g" for one Batch of an 800 g Yield', () => {
    render(<CookEntry {...props()} batches={1} yieldValue={800} yieldUnit="g" />)
    expect(screen.getByText('1 Batch · 800 g')).toBeInTheDocument()
  })
  it('rolls the amount up: "2 Batches · 1.6 kg"', () => {
    render(<CookEntry {...props()} batches={2} yieldValue={800} yieldUnit="g" />)
    expect(screen.getByText('2 Batches · 1.6 kg')).toBeInTheDocument()
  })
  it('follows the User\'s display system', () => {
    render(<CookEntry {...props()} batches={2} yieldValue={800} yieldUnit="g" system="imperial" />)
    expect(screen.getByText('2 Batches · 3 lb 8 oz')).toBeInTheDocument()
  })
  it('a unit of portion still says portions, and a plannable Recipe never says a unit it does not have', () => {
    render(<CookEntry {...props()} batches={3} yieldValue={6} yieldUnit="portion" />)
    expect(screen.getByText('3 Batches · 18 portions')).toBeInTheDocument()
  })
})

// SHORT-04 (Cook bar): one row at every width. Below 375 px the button reads "Cook" and is still named "Start Cook Mode" (label in name holds).
describe('CookEntry: the label of the button (SHORT-04)', () => {
  it('is one button named "Start Cook Mode" by an aria-label, with the long and the short label as spans', () => {
    render(<CookEntry {...props()} />)
    const button = screen.getByRole('button', { name: 'Start Cook Mode' })
    expect(button).toHaveAttribute('aria-label', 'Start Cook Mode')
    const long = button.querySelector('.cook-entry__long')
    const short = button.querySelector('.cook-entry__short')
    expect(long).toHaveTextContent('Start Cook Mode')
    expect(short).toHaveTextContent('Cook')
    expect(short).toHaveAttribute('aria-hidden', 'true')
  })
  it('exposes no second button named "Cook"', () => {
    render(<CookEntry {...props()} />)
    expect(screen.queryByRole('button', { name: 'Cook' })).toBeNull()
  })
})

describe('CookEntry: the hint describes the Stepper (SHORT-04)', () => {
  it('the Batches group is described by the hint, so a short viewport can hide the line and keep the words', () => {
    const { container } = render(<CookEntry {...props()} batches={2} />)
    const hint = container.querySelector('.cook-entry__hint') as HTMLElement
    expect(hint.id).not.toBe('')
    expect(screen.getByRole('group', { name: 'Batches' })).toHaveAttribute('aria-describedby', hint.id)
    expect(screen.getByRole('group', { name: 'Batches' })).toHaveAccessibleDescription('2 Batches · 8 portions')
  })
  it('two Cook entries on a page (it never happens, but) get two ids', () => {
    const { container } = render(
      <>
        <CookEntry {...props()} />
        <CookEntry {...props()} />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('.cook-entry__hint')).map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
  })
})
