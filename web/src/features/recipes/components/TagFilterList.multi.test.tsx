// b8-recipes: the Tag list lets several Tags be selected (docs/dev/design/b8-recipes.md 3.3).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TagFilterList } from './TagFilterList'

const known = [{ name: 'fish', recipes: 3 }, { name: 'oven', recipes: 2 }, { name: 'quick', recipes: 4 }, { name: 'roast', recipes: 1 }]
const list = () => screen.getByRole('listbox', { name: 'Filter by Tag' })
const names = () => within(list()).getAllByRole('option').map((o) => o.textContent ?? '')

describe('TagFilterList with several Tags', () => {
  it('is a multiselectable listbox', () => {
    render(<TagFilterList known={known} selected={[]} onToggle={() => {}} />)
    expect(list()).toHaveAttribute('aria-multiselectable', 'true')
  })
  it('marks every selected Tag and lists them first, in the order chosen', () => {
    render(<TagFilterList known={known} selected={['roast', 'fish']} onToggle={() => {}} />)
    expect(names()[0]).toContain('roast')
    expect(names()[1]).toContain('fish')
    expect(screen.getByRole('option', { name: 'roast' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'fish' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'oven' })).toHaveAttribute('aria-selected', 'false')
  })
  it('toggles one Tag per choice (adds or removes it), calling onToggle with its name', async () => {
    const onToggle = vi.fn()
    render(<TagFilterList known={known} selected={['fish']} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('option', { name: 'oven' }))
    expect(onToggle).toHaveBeenLastCalledWith('oven')
    await userEvent.click(screen.getByRole('option', { name: 'fish' }))
    expect(onToggle).toHaveBeenLastCalledWith('fish')
    expect(onToggle).toHaveBeenCalledTimes(2)
  })
  it('chooses a second Tag from the keyboard while the first stays selected', async () => {
    const onToggle = vi.fn()
    render(<TagFilterList known={known} selected={['fish']} onToggle={onToggle} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'qui{ArrowDown}{Enter}')
    expect(onToggle).toHaveBeenCalledWith('quick')
  })
})
