import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { summary } from '../fixtures.test-helper'
import { RecipeTile } from './RecipeTile'

const base = summary({ name: 'Roast tray', totalMinutes: 40, advanceMinutes: 240 })

describe('RecipeTile', () => {
  it('is one button named after the Recipe that opens it (stretched link, not a button Tile)', async () => {
    const onOpen = vi.fn()
    render(<RecipeTile recipe={base} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /Roast tray/ }))
    expect(onOpen).toHaveBeenCalledWith(3)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('keeps the name and the time in separate elements (QA: "Chicken & leek pie45 min")', () => {
    render(<RecipeTile recipe={base} onOpen={() => {}} />)
    const name = screen.getByText('Roast tray')
    const time = screen.getByText('40 min')
    expect(name).not.toBe(time)
    expect(name).not.toHaveTextContent('40 min')
    expect(name.parentElement).not.toBe(time)
  })

  it('shows the Advance Step as its own "ahead" chip', () => {
    render(<RecipeTile recipe={base} onOpen={() => {}} />)
    expect(screen.getByText('+4 h ahead')).toBeInTheDocument()
  })

  it('says "No Steps" for a Recipe without a timeline and omits the ahead chip', () => {
    render(<RecipeTile recipe={{ ...base, totalMinutes: 0, advanceMinutes: 0 }} onOpen={() => {}} />)
    expect(screen.getByText('No Steps')).toBeInTheDocument()
    expect(screen.queryByText(/ahead/)).toBeNull()
  })

  it('shows the photo through RecipeThumb when there is one', () => {
    const { container } = render(<RecipeTile recipe={{ ...base, imageUrl: '/api/images/abc' }} onOpen={() => {}} />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/images/abc')
    expect(container.querySelector('[data-generated]')).toBeNull()
  })

  it('draws the generated RecipeThumb (Tag icon and initial, not a bare letter) without a photo', () => {
    const { container } = render(<RecipeTile recipe={base} onOpen={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    const thumb = container.querySelector('[data-generated]')
    expect(thumb).not.toBeNull()
    expect(thumb!.querySelector('svg')).not.toBeNull()
    expect(thumb).toHaveTextContent('R')
    expect(container.querySelector('.recipe-tile__art')).toBeNull()
  })

  it('marks Ready Meals and archived Recipes', () => {
    render(<RecipeTile recipe={{ ...base, readyMeal: true, archived: true }} onOpen={() => {}} />)
    expect(screen.getByText('Ready Meal')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('uses a media Tile and none of the deprecated Tile props', () => {
    const { container } = render(<RecipeTile recipe={base} onOpen={() => {}} />)
    const tile = container.querySelector('.tile')!
    expect(tile).toHaveAttribute('data-variant', 'media')
    expect(tile).not.toHaveAttribute('data-size')
    expect(tile).not.toHaveAttribute('data-tone')
  })
})
