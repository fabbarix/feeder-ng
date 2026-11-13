// hf-recipes-filter: OptionList, the always-open searchable listbox (Select's panel without a trigger), used for the Tag filter
// (docs/design/recipes-filter.md 7.2). The caller filters and orders the options; OptionList renders and wires them.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OptionList } from './OptionList'
import type { SelectOption } from './lib'

const all: SelectOption<string>[] = [
  { value: 'fish', label: 'fish', meta: '3 Recipes', leading: <span data-testid="dot-fish" aria-hidden="true" /> },
  { value: 'roast', label: 'roast', meta: '1 Recipe' },
  { value: 'kids', label: 'kids' },
]

function Harness({ onToggle = () => {}, selected = [] as string[], emptyText = null as string | null, options = all }) {
  const [query, setQuery] = useState('')
  const shown = options.filter((o) => o.label.includes(query))
  return (
    <OptionList<string>
      label="Filter by Tag"
      searchLabel="Search Tags"
      query={query}
      onQueryChange={setQuery}
      options={shown}
      selected={selected}
      onToggle={onToggle}
      emptyText={shown.length === 0 ? (emptyText ?? `No Tag matches '${query}'`) : null}
    />
  )
}

describe('OptionList', () => {
  it('is a search combobox over a listbox, both named', () => {
    render(<Harness />)
    const search = screen.getByRole('combobox', { name: 'Search Tags' })
    const list = screen.getByRole('listbox', { name: 'Filter by Tag' })
    expect(search).toHaveAttribute('aria-expanded', 'true')
    expect(search).toHaveAttribute('aria-controls', list.id)
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['fish3 Recipes', 'roast1 Recipe', 'kids'])
  })
  it('names each option by its label and describes it by its meta; the leading visual is decorative', () => {
    render(<Harness />)
    const fish = screen.getByRole('option', { name: 'fish' })
    expect(fish).toHaveAccessibleDescription('3 Recipes')
    expect(within(fish).getByTestId('dot-fish')).toHaveAttribute('aria-hidden', 'true')
  })
  it('marks the selected values', () => {
    render(<Harness selected={['roast']} />)
    expect(screen.getByRole('option', { name: 'roast' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'fish' })).toHaveAttribute('aria-selected', 'false')
  })
  it('a click toggles an option', async () => {
    const onToggle = vi.fn()
    render(<Harness onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('option', { name: 'roast' }))
    expect(onToggle).toHaveBeenCalledWith('roast')
  })
  it('typing changes the query (the caller narrows the options)', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'ro')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['roast1 Recipe'])
  })
  it('arrows move the active option (aria-activedescendant) and Enter toggles it, focus staying in the search', async () => {
    const onToggle = vi.fn()
    render(<Harness onToggle={onToggle} />)
    const search = screen.getByRole('combobox', { name: 'Search Tags' })
    search.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'fish' }).id)
    await userEvent.keyboard('{ArrowDown}')
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'roast' }).id)
    await userEvent.keyboard('{End}')
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'kids' }).id)
    await userEvent.keyboard('{Home}{Enter}')
    expect(onToggle).toHaveBeenCalledWith('fish')
    expect(search).toHaveFocus()
  })
  it('shows the empty text in place of the options', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'zzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText("No Tag matches 'zzz'")).toBeInTheDocument()
  })
  it('has no native select', () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('select')).toBeNull()
  })
})
