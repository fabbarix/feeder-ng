// RX-04: from 1024 px a Cook tile sits under the hero: a section named "Cook", the Batches Stepper with its hint, and a full-width primary "Start Cook Mode".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookTile } from './CookTile'

const props = () => ({ batches: 2, onBatchesChange: vi.fn(), yieldValue: 4, onStart: vi.fn() })

describe('CookTile', () => {
  it('is a section named "Cook" whose heading is "Cook" (a level 2 heading, the title-3 role)', () => {
    const { container } = render(<CookTile {...props()} />)
    const section = screen.getByRole('region', { name: 'Cook' })
    expect(section.tagName).toBe('SECTION')
    expect(section).toHaveClass('tile')
    expect(section).toHaveAttribute('data-variant', 'surface')
    const heading = within(section).getByRole('heading', { level: 2, name: 'Cook' })
    expect(section).toHaveAttribute('aria-labelledby', heading.id)
    expect(heading).toHaveClass('recipe-cook__title')
    expect(container.querySelector('.sticky-action-bar')).toBeNull()
  })
  it('holds the Batches Stepper with its hint and the primary button', async () => {
    const p = props()
    render(<CookTile {...p} />)
    const section = screen.getByRole('region', { name: 'Cook' })
    expect(within(section).getByRole('spinbutton', { name: 'Batches' })).toHaveAttribute('aria-valuenow', '2')
    expect(within(section).getByText('2 Batches · 8 portions')).toBeInTheDocument()
    const start = within(section).getByRole('button', { name: 'Start Cook Mode' })
    expect(start).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(start)
    expect(p.onStart).toHaveBeenCalledOnce()
  })
  it('has no Close and no second action', () => {
    render(<CookTile {...props()} />)
    const section = screen.getByRole('region', { name: 'Cook' })
    expect(within(section).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Decrease Batches', 'Increase Batches', 'Start Cook Mode'])
  })
  it('states the Yield of a Base recipe with its unit', () => {
    render(<CookTile {...props()} batches={2} yieldValue={800} yieldUnit="g" />)
    expect(screen.getByText('2 Batches · 1.6 kg')).toBeInTheDocument()
  })
})
