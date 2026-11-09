import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine } from '../testData'
import { extraEntry, lineEntry } from '../lib/lines'
import { LineTile } from './LineTile'

const line = lineEntry(makeLine(), 'USD', 'metric')

describe('LineTile', () => {
  it('shows the title, the pack suggestion and the estimated cost', () => {
    render(<LineTile entry={line} onTick={() => {}} onUntick={() => {}} />)
    expect(screen.getByText('Passata')).toBeInTheDocument()
    expect(screen.getByText('1400 g · 2 × Mutti 700 g')).toBeInTheDocument()
    expect(screen.getByText('$3.18')).toBeInTheDocument()
  })

  it('shows a dash when there is no Price', () => {
    render(<LineTile entry={lineEntry(makeLine({ estimatedCostCents: null }), 'USD', 'metric')} onTick={() => {}} onUntick={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
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

  it('extras can be deleted, Lines cannot', async () => {
    const onDelete = vi.fn()
    const extra = extraEntry(makeExtra(), 'metric')
    const { rerender } = render(<LineTile entry={extra} onTick={() => {}} onUntick={() => {}} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete toilet paper' }))
    expect(onDelete).toHaveBeenCalledWith(extra)
    rerender(<LineTile entry={line} onTick={() => {}} onUntick={() => {}} onDelete={onDelete} />)
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })
})
