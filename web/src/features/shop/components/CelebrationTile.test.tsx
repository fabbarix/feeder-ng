import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CelebrationTile } from './CelebrationTile'

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
}
afterEach(() => vi.unstubAllGlobals())

describe('CelebrationTile', () => {
  it('counts the Lines, the money spent and the Stock Lots added', () => {
    motion(false)
    render(<CelebrationTile summary={{ lines: 12, spentCents: 4837, lotsAdded: 14 }} currency="USD" />)
    const tile = screen.getByRole('status')
    expect(tile).toHaveTextContent('Shopping list complete')
    expect(tile).toHaveTextContent('12 lines')
    expect(tile).toHaveTextContent('$48.37 spent')
    expect(tile).toHaveTextContent('14 Stock Lots added')
  })

  it('uses singular forms', () => {
    motion(false)
    render(<CelebrationTile summary={{ lines: 1, spentCents: 159, lotsAdded: 1 }} currency="USD" />)
    expect(screen.getByRole('status')).toHaveTextContent('1 line')
    expect(screen.getByRole('status')).toHaveTextContent('1 Stock Lot added')
  })

  it('is a soft Tile with a celebration icon, on the new Tile API (no legacy tone)', () => {
    motion(false)
    render(<CelebrationTile summary={{ lines: 1, spentCents: 0, lotsAdded: 0 }} currency="USD" />)
    const tile = screen.getByRole('status')
    expect(tile).toHaveAttribute('data-variant', 'soft')
    expect(tile.querySelector('svg')).not.toBeNull()
  })

  it('QA: says nothing about money when nothing was spent', () => {
    motion(false)
    render(<CelebrationTile summary={{ lines: 3, spentCents: 0, lotsAdded: 0 }} currency="USD" />)
    expect(screen.getByRole('status')).not.toHaveTextContent('$0.00')
  })

  it('animates unless the User prefers reduced motion', () => {
    motion(false)
    const { unmount } = render(<CelebrationTile summary={{ lines: 1, spentCents: 0, lotsAdded: 0 }} currency="USD" />)
    expect(screen.getByRole('status')).toHaveAttribute('data-celebrate')
    unmount()
    motion(true)
    render(<CelebrationTile summary={{ lines: 1, spentCents: 0, lotsAdded: 0 }} currency="USD" />)
    expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrate')
  })
})
