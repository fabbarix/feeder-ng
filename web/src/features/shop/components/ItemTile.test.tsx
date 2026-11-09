import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine } from '../testData'
import { extraItem, lineItem } from '../lib/lines'
import { ItemTile } from './ItemTile'

const line = lineItem(makeLine(), 'USD', 'metric')

describe('ItemTile', () => {
  it('shows the title, the pack suggestion and the cost', () => {
    render(<ItemTile item={line} onTick={() => {}} onUntick={() => {}} />)
    expect(screen.getByText('Passata')).toBeInTheDocument()
    expect(screen.getByText('1400 g · 2 × Mutti 700 g')).toBeInTheDocument()
    expect(screen.getByText('$3.18')).toBeInTheDocument()
  })

  it('shows a dash when there is no Price', () => {
    render(<ItemTile item={lineItem(makeLine({ costCents: null }), 'USD', 'metric')} onTick={() => {}} onUntick={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('ticks an open item', async () => {
    const onTick = vi.fn()
    render(<ItemTile item={line} onTick={onTick} onUntick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Tick Passata' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(onTick).toHaveBeenCalledWith(line)
  })

  it('unticks a ticked item', async () => {
    const done = lineItem(makeLine({ ticked: true, quantity: 0, pack: null, costCents: null }), 'USD', 'metric')
    const onUntick = vi.fn()
    render(<ItemTile item={done} onTick={() => {}} onUntick={onUntick} />)
    const button = screen.getByRole('button', { name: 'Untick Passata' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(onUntick).toHaveBeenCalledWith(done)
  })

  it('extras can be deleted, Lines cannot', async () => {
    const onDelete = vi.fn()
    const extra = extraItem(makeExtra(), 'metric')
    const { rerender } = render(<ItemTile item={extra} onTick={() => {}} onUntick={() => {}} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete toilet paper' }))
    expect(onDelete).toHaveBeenCalledWith(extra)
    rerender(<ItemTile item={line} onTick={() => {}} onUntick={() => {}} onDelete={onDelete} />)
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })
})
