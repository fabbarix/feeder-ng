import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecipeSummary } from '../types'
import { RecipeTile } from './RecipeTile'

const base: RecipeSummary = {
  id: 3, name: 'Roast tray', yield: 4, readyMeal: false, tags: ['roast'], imageUrl: '', archived: false, totalMinutes: 40, advanceMinutes: 240,
}

describe('RecipeTile', () => {
  it('is a button named after the Recipe that opens it', async () => {
    const onOpen = vi.fn()
    render(<RecipeTile recipe={base} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /Roast tray/ }))
    expect(onOpen).toHaveBeenCalledWith(3)
  })

  it('shows the total time and the Advance Step separately', () => {
    render(<RecipeTile recipe={base} onOpen={() => {}} />)
    expect(screen.getByText('40 min')).toBeInTheDocument()
    expect(screen.getByText('+4 h advance')).toBeInTheDocument()
  })

  it('says "No Steps" for a Recipe without a timeline and omits the Advance Chip', () => {
    render(<RecipeTile recipe={{ ...base, totalMinutes: 0, advanceMinutes: 0 }} onOpen={() => {}} />)
    expect(screen.getByText('No Steps')).toBeInTheDocument()
    expect(screen.queryByText(/advance/)).toBeNull()
  })

  it('shows the photo when there is one', () => {
    render(<RecipeTile recipe={{ ...base, imageUrl: '/api/images/abc' }} onOpen={() => {}} />)
    expect(document.querySelector('img')).toHaveAttribute('src', '/api/images/abc')
  })

  it('draws a generated tile (initial and Tag icon) when there is no photo', () => {
    render(<RecipeTile recipe={base} onOpen={() => {}} />)
    expect(document.querySelector('img')).toBeNull()
    const art = screen.getByTestId('recipe-art')
    expect(art).toHaveTextContent('R')
    expect(art).toHaveAttribute('data-icon', 'roast')
  })

  it('marks Ready Meals and archived Recipes', () => {
    render(<RecipeTile recipe={{ ...base, readyMeal: true, archived: true }} onOpen={() => {}} />)
    expect(screen.getByText('Ready Meal')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
})
