// hf-recipes-filter: the Filters button of the Recipes list header (docs/design/recipes-filter.md 4, 8, 9).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RecipeFiltersButton } from './RecipeFiltersButton'

describe('RecipeFiltersButton', () => {
  it('reads "Filters" with no count while no filter is on', () => {
    const { container } = render(<RecipeFiltersButton count={0} expanded={false} onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Filters' })
    expect(button).toHaveTextContent(/^Filters$/)
    expect(container.querySelector('.chip[data-kind="count"]')).toBeNull()
  })
  it('shows the count and says it in its name', () => {
    const { container } = render(<RecipeFiltersButton count={2} expanded={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
    const count = container.querySelector('.chip[data-kind="count"]')
    expect(count).toHaveTextContent('2')
    expect(count?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
  it('is a secondary button with the filter icon (New Recipe stays the one accent action)', () => {
    render(<RecipeFiltersButton count={0} expanded={false} onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Filters' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button.querySelector('svg')).not.toBeNull()
  })
  it('says it opens a dialog, whether it is open, and which panel it controls', () => {
    const { rerender } = render(<RecipeFiltersButton count={0} expanded={false} controls="recipe-filters" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Filters' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    rerender(<RecipeFiltersButton count={0} expanded controls="recipe-filters" onClick={() => {}} />)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', 'recipe-filters')
  })
  it('calls onClick and hands its element to ref (the panel anchors to it)', async () => {
    const onClick = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    render(<RecipeFiltersButton ref={ref} count={1} expanded={false} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(ref.current).toBe(screen.getByRole('button'))
  })
})
