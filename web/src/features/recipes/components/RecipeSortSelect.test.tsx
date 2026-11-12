// Beta.5 F7: the Sort select of the Recipes list: the shared Select, no native control.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeSortSelect } from './RecipeSortSelect'

const trigger = () => screen.getByRole('combobox', { name: /Sort/ })

describe('RecipeSortSelect', () => {
  it('is a combobox named Sort that shows the sort in force', () => {
    render(<RecipeSortSelect value="name" onChange={() => {}} />)
    expect(trigger()).toHaveTextContent('Name')
  })
  it('shows the long label of a last cooked sort', () => {
    render(<RecipeSortSelect value="last_cooked_desc" onChange={() => {}} />)
    expect(trigger()).toHaveTextContent('Last cooked: most recent first')
  })
  it('lists Name, then longest ago first, then most recent first', async () => {
    render(<RecipeSortSelect value="name" onChange={() => {}} />)
    await userEvent.click(trigger())
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Name', 'Last cooked: longest ago first', 'Last cooked: most recent first'])
  })
  it('answers the sort key of the chosen option', async () => {
    const onChange = vi.fn()
    render(<RecipeSortSelect value="name" onChange={onChange} />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('option', { name: 'Last cooked: longest ago first' }))
    expect(onChange).toHaveBeenCalledWith('last_cooked_asc')
  })
  it('works from the keyboard', async () => {
    const onChange = vi.fn()
    render(<RecipeSortSelect value="name" onChange={onChange} />)
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('last_cooked_desc')
  })
  it('uses no native <select>', () => {
    const { container } = render(<RecipeSortSelect value="name" onChange={() => {}} />)
    expect(container.querySelector('select')).toBeNull()
  })
})
