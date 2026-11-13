import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeKindControl } from './RecipeKindControl'

describe('RecipeKindControl: Recipes · Base recipes', () => {
  it('is a crafted segmented control (radiogroup), not a native select', () => {
    render(<RecipeKindControl value="plannable" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument()
    expect(document.querySelector('select')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Recipes' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Base recipes' })).not.toBeChecked()
  })
  it('shows Base recipes checked for base', () => {
    render(<RecipeKindControl value="base" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Base recipes' })).toBeChecked()
  })
  it('reports the choice', async () => {
    const onChange = vi.fn()
    render(<RecipeKindControl value="plannable" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Base recipes' }))
    expect(onChange).toHaveBeenCalledWith('base')
  })
  it('hf-recipes-filter: is compact, with its "Kind" label visually hidden (still the radiogroup name)', () => {
    const { container } = render(<RecipeKindControl value="plannable" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Kind' })).toHaveAttribute('data-compact')
    expect(container.querySelector('.ui-field__label')).toHaveClass('visually-hidden')
  })
})
