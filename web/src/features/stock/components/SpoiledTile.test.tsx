import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import { SpoiledTile } from './SpoiledTile'

const today = '2026-11-09'

describe('SpoiledTile', () => {
  it('renders nothing when no Stock Lot has gone off', () => {
    const { container } = render(<SpoiledTile lots={[]} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  // R11b N8: a half-width spoil tile left an empty column beside it on the phone (screenshot 01); it spans the row.
  it('spans the full grid row', () => {
    const { container } = render(<SpoiledTile lots={[makeLot({ id: 1 })]} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(container.querySelector('.tile')).toHaveAttribute('data-span', 'full')
  })

  it('asks "Throw out or keep?" in a danger status Tile and lists each lot', () => {
    render(
      <SpoiledTile
        today={today}
        onThrowOut={() => {}}
        onKeep={() => {}}
        lots={[makeLot({ id: 1 }), makeLot({ id: 2, ingredientName: 'milk', quantity: 1000, baseUnit: 'ml', goesOff: '2026-11-08' })]}
      />,
    )
    expect(screen.getByText('Throw out or keep?')).toBeInTheDocument()
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument()
    // L-07: each lot is a ListRow; the meta line carries the amount and the go-off wording.
    expect(screen.getByText('200 g · Went off 4 days ago')).toBeInTheDocument()
    expect(screen.getByText('1000 ml · Went off yesterday')).toBeInTheDocument()
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Throw out or keep?' })).toHaveAttribute('data-status', 'danger')
  })

  it('capitalises names for display only; the button names keep the stored name', () => {
    render(<SpoiledTile today={today} lots={[makeLot()]} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(document.querySelector('.list-row__title')).toHaveTextContent('Chicken thighs')
    expect(screen.getByRole('button', { name: 'Throw out chicken thighs' })).toBeInTheDocument()
  })

  it('reports which lot is thrown out or kept', async () => {
    const onThrowOut = vi.fn()
    const onKeep = vi.fn()
    render(<SpoiledTile today={today} lots={[makeLot({ id: 11 }), makeLot({ id: 12, ingredientName: 'milk' })]} onThrowOut={onThrowOut} onKeep={onKeep} />)
    await userEvent.click(screen.getByRole('button', { name: 'Throw out chicken thighs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep milk' }))
    expect(onThrowOut).toHaveBeenCalledWith(11)
    expect(onKeep).toHaveBeenCalledWith(12)
  })

  it('is a danger status Tile using the status tokens, with no legacy tone', () => {
    render(<SpoiledTile today={today} lots={[makeLot()]} onThrowOut={() => {}} onKeep={() => {}} />)
    const tile = screen.getByRole('region', { name: 'Throw out or keep?' })
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).not.toHaveAttribute('data-tone')
  })

  it('Throw out is a danger tertiary with a Trash icon; Keep is a secondary with a Check icon', () => {
    render(<SpoiledTile today={today} lots={[makeLot()]} onThrowOut={() => {}} onKeep={() => {}} />)
    const out = screen.getByRole('button', { name: 'Throw out chicken thighs' })
    const keep = screen.getByRole('button', { name: 'Keep chicken thighs' })
    expect(out).toHaveAttribute('data-variant', 'danger-tertiary')
    expect(keep).toHaveAttribute('data-variant', 'secondary')
    expect(out.querySelector('svg')).not.toBeNull()
    expect(keep.querySelector('svg')).not.toBeNull()
    expect(out).toHaveTextContent('Throw out')
    expect(keep).toHaveTextContent('Keep')
  })

  it('has no primary Button (the screen header owns the primary)', () => {
    render(<SpoiledTile today={today} lots={[makeLot()]} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(document.querySelector('button[data-variant="primary"]')).toBeNull()
  })
})
