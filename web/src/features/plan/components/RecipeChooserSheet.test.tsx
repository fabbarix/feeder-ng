import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeChooserSheet } from './RecipeChooserSheet'

const recipes = [
  { id: 1, name: 'Omelette', tags: ['eggs'] },
  { id: 2, name: 'Risotto', tags: ['rice'], imageUrl: '/img/risotto.jpg', totalMinutes: 35 },
  { id: 3, name: 'Ratatouille', tags: [] },
]

function setup(over: Partial<React.ComponentProps<typeof RecipeChooserSheet>> = {}) {
  const onPick = vi.fn()
  render(<RecipeChooserSheet open onClose={() => {}} recipes={recipes} isLoading={false} onPick={onPick} {...over} />)
  return { onPick }
}

describe('RecipeChooserSheet', () => {
  it('lists the Recipes as rows with thumbs, not as a stack of buttons', () => {
    setup()
    const list = screen.getByRole('list', { name: 'Recipes' })
    expect(list.querySelectorAll('li')).toHaveLength(3)
    expect(list.querySelectorAll('.recipe-thumb')).toHaveLength(3)
  })

  it('choosing a row picks that Recipe', async () => {
    const { onPick } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Risotto' }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('a search field narrows the list (no native search input styling)', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Recipes' }), 'ra')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ratatouille'])
  })

  it('says so with no Recipes, and while loading', () => {
    const { unmount } = render(<RecipeChooserSheet open onClose={() => {}} recipes={[]} isLoading={false} onPick={() => {}} />)
    expect(screen.getByText('There are no Recipes yet.')).toBeInTheDocument()
    unmount()
    render(<RecipeChooserSheet open onClose={() => {}} recipes={[]} isLoading onPick={() => {}} />)
    expect(screen.getByText('Loading the plan…')).toBeInTheDocument()
  })
})
