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

  it('asks "Throw out or keep?" in the spoil tone and lists each lot', () => {
    render(
      <SpoiledTile
        today={today}
        onThrowOut={() => {}}
        onKeep={() => {}}
        lots={[makeLot({ id: 1 }), makeLot({ id: 2, ingredientName: 'milk', quantity: 1000, baseUnit: 'ml', goesOff: '2026-11-08' })]}
      />,
    )
    expect(screen.getByText('Throw out or keep?')).toBeInTheDocument()
    expect(screen.getByText('chicken thighs')).toBeInTheDocument()
    expect(screen.getByText('200 g')).toBeInTheDocument()
    expect(screen.getByText('Went off 4 days ago')).toBeInTheDocument()
    expect(screen.getByText('1000 ml')).toBeInTheDocument()
    expect(screen.getByText('Went off yesterday')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Throw out or keep?' })).toHaveAttribute('data-tone', 'spoil')
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
})
