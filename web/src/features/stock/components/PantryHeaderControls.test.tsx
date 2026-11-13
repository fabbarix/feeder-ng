// pantry-filter: the List control, the Sort chip and the More menu of the Pantry header (docs/design/pantry-filter.md 2.7, 3, 8, 9).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PantryModeControl } from './PantryModeControl'
import { PantryOverflowMenu } from './PantryOverflowMenu'
import { PantrySortSelect } from './PantrySortSelect'

describe('PantryModeControl', () => {
  it('is a compact radiogroup "List" whose label is hidden', async () => {
    const onChange = vi.fn()
    const { container } = render(<PantryModeControl value="places" onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: 'List' })).toHaveAttribute('data-compact', 'true')
    expect(container.querySelector('.ui-field__label')).toHaveClass('visually-hidden')
    expect(screen.getByRole('radio', { name: 'Storage Place' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Ingredient' }))
    expect(onChange).toHaveBeenCalledWith('ingredients')
  })
})

describe('PantrySortSelect', () => {
  it('is a chip combobox "Sort" with the sort icon and a short value', async () => {
    const onChange = vi.fn()
    render(<PantrySortSelect value="purchased" onChange={onChange} />)
    const sort = screen.getByRole('combobox', { name: 'Sort' })
    expect(sort).toHaveTextContent('Bought')
    expect(sort).not.toHaveTextContent('Bought (newest)')
    await userEvent.click(sort)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Good until', 'Name', 'Quantity', 'Bought (newest)', 'Storage Place'])
    await userEvent.click(screen.getByRole('option', { name: 'Name' }))
    expect(onChange).toHaveBeenCalledWith('name')
  })
})

describe('PantryOverflowMenu', () => {
  it('"More actions" holds Storage Places, a link to their settings', async () => {
    render(
      <MemoryRouter>
        <PantryOverflowMenu />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Storage Places' })).toHaveAttribute('href', '/settings/storage-places')
  })
})
