// hf-recipes-filter: the Tag filter inside the Filters panel: a searchable list of every Tag by name, with its colour and count
// (docs/design/recipes-filter.md 4, 5.3, 5.5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TagFilterList } from './TagFilterList'

const many = Array.from({ length: 28 }, (_, i) => ({ name: `Tag ${String(i + 1).padStart(2, '0')}`, recipes: i % 4 }))
  .concat([{ name: 'fish', recipes: 3 }, { name: 'roast', recipes: 1 }])
const colourOf = (n: string) => ({ fish: 'teal', roast: 'tomato' } as Record<string, string | undefined>)[n]
/** Each option's name: the element it is labelled by, else its aria-label, else its text. */
const nameOf = (o: HTMLElement) => {
  const by = o.getAttribute('aria-labelledby')
  return (by ? document.getElementById(by)?.textContent : null) ?? o.getAttribute('aria-label') ?? o.textContent
}
const optionNames = () => within(screen.getByRole('listbox', { name: 'Filter by Tag' })).getAllByRole('option').map(nameOf)

describe('TagFilterList', () => {
  it('lists every Tag by name, each named and described by its Recipe count', () => {
    render(<TagFilterList known={many} selected="" colourOf={colourOf} onSelect={() => {}} />)
    expect(optionNames()).toHaveLength(30)
    expect(optionNames()[0]).toBe('fish')
    expect(screen.getByRole('option', { name: 'fish' })).toHaveAccessibleDescription('3 Recipes')
    expect(screen.getByRole('option', { name: 'roast' })).toHaveAccessibleDescription('1 Recipe')
  })
  it('shows each Tag\'s colour dot (decorative)', () => {
    render(<TagFilterList known={many} selected="" colourOf={colourOf} onSelect={() => {}} />)
    const dot = screen.getByRole('option', { name: 'fish' }).querySelector('.tag-dot')
    expect(dot).toHaveAttribute('data-tag-colour', 'teal')
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })
  it('puts the selected Tag first and marks it', () => {
    render(<TagFilterList known={many} selected="roast" colourOf={colourOf} onSelect={() => {}} />)
    expect(optionNames()[0]).toBe('roast')
    expect(screen.getByRole('option', { name: 'roast' })).toHaveAttribute('aria-selected', 'true')
  })
  it('finds a Tag by name and chooses it', async () => {
    const onSelect = vi.fn()
    render(<TagFilterList known={many} selected="" colourOf={colourOf} onSelect={onSelect} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'ROA')
    expect(optionNames()).toEqual(['roast'])
    await userEvent.click(screen.getByRole('option', { name: 'roast' }))
    expect(onSelect).toHaveBeenCalledWith('roast')
  })
  it('chooses from the keyboard', async () => {
    const onSelect = vi.fn()
    render(<TagFilterList known={many} selected="" colourOf={colourOf} onSelect={onSelect} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'fish{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('fish')
  })
  it('says when nothing matches', async () => {
    render(<TagFilterList known={many} selected="" colourOf={colourOf} onSelect={() => {}} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'zzz')
    expect(screen.getByText("No Tag matches 'zzz'")).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
  it('says there is no Tag to choose from', () => {
    render(<TagFilterList known={[]} selected="" onSelect={() => {}} />)
    expect(screen.getByText('No Tag to choose from')).toBeInTheDocument()
  })
})
