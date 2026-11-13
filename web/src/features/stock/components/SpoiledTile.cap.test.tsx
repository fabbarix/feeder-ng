// DS-TODAY (audit: "Throw out or keep? lists 7 rows, each with two buttons, which is very tall"): at most 3 rows, then "Show N more".
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import { SpoiledTile } from './SpoiledTile'

const today = '2026-11-09'
const lots = (n: number) => Array.from({ length: n }, (_, i) => makeLot({ id: i + 1, ingredientName: `ingredient ${i + 1}` }))
const rowsIn = (c: HTMLElement) => c.querySelectorAll('.spoiled-tile__list .list-row')

describe('SpoiledTile: capped at 3 rows', () => {
  it('7 Stock Lots show 3 rows and a "Show 4 more" button', () => {
    const { container } = render(<SpoiledTile lots={lots(7)} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(rowsIn(container)).toHaveLength(3)
    expect(screen.getByText('Ingredient 3')).toBeInTheDocument()
    expect(screen.queryByText('Ingredient 4')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 4 more' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('"Show 4 more" reveals every row, then reads "Show less" and collapses again', async () => {
    const { container } = render(<SpoiledTile lots={lots(7)} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    expect(rowsIn(container)).toHaveLength(7)
    const less = screen.getByRole('button', { name: 'Show less' })
    expect(less).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(less)
    expect(rowsIn(container)).toHaveLength(3)
  })

  it('3 or fewer Lots: every row, no button (the existing tests with 1-2 Lots are unchanged)', () => {
    const { container } = render(<SpoiledTile lots={lots(3)} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(rowsIn(container)).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /^Show / })).not.toBeInTheDocument()
  })

  it('the revealed rows act like the first ones', async () => {
    const onThrowOut = vi.fn()
    render(<SpoiledTile lots={lots(5)} today={today} onThrowOut={onThrowOut} onKeep={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    await userEvent.click(screen.getByRole('button', { name: 'Throw out ingredient 5' }))
    expect(onThrowOut).toHaveBeenCalledWith(5)
  })

  it('handling rows down to 3 removes the button; the cap counts rows, not buttons', () => {
    const { container, rerender } = render(<SpoiledTile lots={lots(4)} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show 1 more' })).toBeInTheDocument()
    rerender(<SpoiledTile lots={lots(3)} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Show / })).not.toBeInTheDocument()
    expect(rowsIn(container)).toHaveLength(3)
  })

  it('the toggle is a real Button of the tile (tertiary), after the list, never one of the rows', () => {
    const { container } = render(<SpoiledTile lots={lots(5)} today={today} onThrowOut={() => {}} onKeep={() => {}} />)
    const toggle = screen.getByRole('button', { name: 'Show 2 more' })
    expect(toggle).toHaveAttribute('data-variant', 'tertiary')
    expect(container.querySelector('.spoiled-tile__list')!.contains(toggle)).toBe(false)
  })
})
