import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine } from '../testData'
import { extraEntry, lineEntry } from '../lib/lines'
import { LineTile } from './LineTile'

const line = lineEntry(makeLine(), 'USD', 'metric')

describe('LineTile', () => {
  it('shows the quantity, the name, the pack suggestion and the estimated cost (ui-fix-plan 5.5)', () => {
    const { container } = render(<LineTile entry={line} onTick={() => {}} onUntick={() => {}} />)
    expect(container.querySelector('.line-tile__quantity')).toHaveTextContent('1400 g')
    expect(container.querySelector('.line-tile__title')).toHaveTextContent('Passata')
    expect(container.querySelector('.line-tile__pack')).toHaveTextContent('2 × Mutti 700 g')
    expect(screen.getByText('$3.18')).toBeInTheDocument()
  })

  it('shows no cost and no dash when there is no Price', () => {
    const { container } = render(<LineTile entry={lineEntry(makeLine({ estimatedCostCents: null }), 'USD', 'metric')} onTick={() => {}} onUntick={() => {}} />)
    expect(container.querySelector('.line-tile__estimated-cost')).toBeNull()
    expect(container).not.toHaveTextContent('—')
  })

  it('an open entry shows an empty tick control; a ticked one shows a check mark and the title is struck through', () => {
    const open = render(<LineTile entry={line} onTick={() => {}} onUntick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Tick Passata' }).querySelector('svg')).toBeNull()
    expect(open.container.querySelector('.line-tile')).toHaveAttribute('data-state', 'open')
    open.unmount()
    const ticked = lineEntry(makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null }), 'USD', 'metric')
    const view = render(<LineTile entry={ticked} onTick={() => {}} onUntick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Untick Passata' }).querySelector('svg')).not.toBeNull()
    expect(view.container.querySelector('.line-tile')).toHaveAttribute('data-state', 'ticked')
  })

  it('ticks an open entry', async () => {
    const onTick = vi.fn()
    render(<LineTile entry={line} onTick={onTick} onUntick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Tick Passata' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(onTick).toHaveBeenCalledWith(line)
  })

  it('unticks a ticked entry', async () => {
    const ticked = lineEntry(makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null }), 'USD', 'metric')
    const onUntick = vi.fn()
    render(<LineTile entry={ticked} onTick={() => {}} onUntick={onUntick} />)
    const button = screen.getByRole('button', { name: 'Untick Passata' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(onUntick).toHaveBeenCalledWith(ticked)
  })

  it('extras show a note icon and a labelled Delete IconButton (no bare ×); Lines cannot be deleted', async () => {
    const onDelete = vi.fn()
    const extra = extraEntry(makeExtra(), 'metric')
    const { rerender, container } = render(<LineTile entry={extra} onTick={() => {}} onUntick={() => {}} onDelete={onDelete} />)
    const del = screen.getByRole('button', { name: 'Delete toilet paper' })
    expect(del).toHaveAttribute('data-size', 'compact')
    expect(del.textContent).toBe('')
    expect(container).not.toHaveTextContent('×')
    expect(container.querySelector('.line-tile__extra-icon svg')).not.toBeNull()
    await userEvent.click(del)
    expect(onDelete).toHaveBeenCalledWith(extra)
    rerender(<LineTile entry={line} onTick={() => {}} onUntick={() => {}} onDelete={onDelete} />)
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })
})
