// B9-15 (RX-09): OptionList gains `onCreate`, `createLabel(query)` and `createMeta`, mirroring Select's create row (same
// `.select__option--create` CSS). Without `onCreate` nothing changes for any other OptionList user. The Tag chooser is built on it.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OptionList } from './OptionList'
import type { SelectOption } from './lib'

const all: SelectOption<string>[] = [
  { value: 'quick', label: 'quick', meta: '3 Recipes' },
  { value: 'family', label: 'family' },
  { value: 'pasta', label: 'pasta' },
]

function Harness({ onToggle = () => {}, onCreate, createMeta }: { onToggle?: (v: string) => void; onCreate?: (q: string) => void; createMeta?: string }) {
  const [query, setQuery] = useState('')
  const shown = all.filter((o) => o.label.includes(query.trim().toLowerCase()))
  return (
    <OptionList<string>
      label="Tags"
      searchLabel="Search or add a Tag"
      query={query}
      onQueryChange={setQuery}
      options={shown}
      selected={[]}
      onToggle={onToggle}
      multiple
      onCreate={onCreate}
      createLabel={(q) => `Add Tag "${q}"`}
      createMeta={createMeta}
    />
  )
}
const search = () => screen.getByRole('combobox', { name: 'Search or add a Tag' })
const create = () => screen.queryByRole('option', { name: /^Add Tag/ })

const scrolled: string[] = []
beforeEach(() => {
  scrolled.length = 0
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id)
  }
})
afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe('OptionList create row', () => {
  it('no row without onCreate, whatever is typed', async () => {
    render(<Harness />)
    await userEvent.type(search(), 'spicy')
    expect(create()).toBeNull()
  })
  it('no row while the query is empty or blank', async () => {
    render(<Harness onCreate={() => {}} />)
    expect(create()).toBeNull()
    await userEvent.type(search(), '   ')
    expect(create()).toBeNull()
  })
  it('a query that matches no Tag exactly shows the row last: an option with the plus icon and the create label', async () => {
    render(<Harness onCreate={() => {}} createMeta="New Tag, gets the next Tag colour" />)
    await userEvent.type(search(), 'qui')
    const row = create()!
    expect(row).toHaveAttribute('aria-selected', 'false')
    expect(row).toHaveClass('select__option--create')
    expect(row).toHaveAccessibleName('Add Tag "qui"')
    expect(row).toHaveAccessibleDescription('New Tag, gets the next Tag colour')
    expect(row.querySelector('svg')).toBeInTheDocument()
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.at(-1)).toBe(row)
  })
  it('an exact match (case and spaces aside) hides the row', async () => {
    render(<Harness onCreate={() => {}} />)
    await userEvent.type(search(), ' Quick ')
    expect(create()).toBeNull()
  })
  it('clicking the row calls onCreate with the trimmed query and clears the query', async () => {
    const onCreate = vi.fn()
    render(<Harness onCreate={onCreate} />)
    await userEvent.type(search(), ' spicy ')
    await userEvent.click(create()!)
    expect(onCreate).toHaveBeenCalledWith('spicy')
    expect(search()).toHaveValue('')
  })
  it('Enter on the active create row adds (ArrowDown reaches it past the matches)', async () => {
    const onCreate = vi.fn()
    render(<Harness onCreate={onCreate} />)
    await userEvent.type(search(), 'qui')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(search()).toHaveAttribute('aria-activedescendant', create()!.id)
    await userEvent.keyboard('{Enter}')
    expect(onCreate).toHaveBeenCalledWith('qui')
  })
  it('End reaches the create row and scrolls it into view', async () => {
    render(<Harness onCreate={() => {}} />)
    await userEvent.type(search(), 'qui')
    await userEvent.keyboard('{End}')
    expect(search()).toHaveAttribute('aria-activedescendant', create()!.id)
    expect(scrolled.at(-1)).toBe(create()!.id)
  })
  it('Enter with no active option and an exact match toggles that Tag', async () => {
    const onToggle = vi.fn()
    const onCreate = vi.fn()
    render(<Harness onToggle={onToggle} onCreate={onCreate} />)
    await userEvent.type(search(), 'family{Enter}')
    expect(onToggle).toHaveBeenCalledWith('family')
    expect(onCreate).not.toHaveBeenCalled()
  })
  it('Enter with no active option and no exact match adds the query', async () => {
    const onToggle = vi.fn()
    const onCreate = vi.fn()
    render(<Harness onToggle={onToggle} onCreate={onCreate} />)
    await userEvent.type(search(), 'weekend{Enter}')
    expect(onCreate).toHaveBeenCalledWith('weekend')
    expect(onToggle).not.toHaveBeenCalled()
  })
  it('a comma does the same, so "quick, family" types fast: the text before it is committed and the field is cleared', async () => {
    const onToggle = vi.fn()
    const onCreate = vi.fn()
    render(<Harness onToggle={onToggle} onCreate={onCreate} />)
    await userEvent.type(search(), 'quick,')
    expect(onToggle).toHaveBeenCalledWith('quick')
    expect(search()).toHaveValue('')
    await userEvent.type(search(), 'weekend,')
    expect(onCreate).toHaveBeenCalledWith('weekend')
    expect(search()).toHaveValue('')
  })
  it('a comma with nothing before it does nothing', async () => {
    const onCreate = vi.fn()
    render(<Harness onCreate={onCreate} />)
    await userEvent.type(search(), ',')
    expect(onCreate).not.toHaveBeenCalled()
  })
  it('without onCreate, Enter with no active option and a comma do nothing (as before)', async () => {
    const onToggle = vi.fn()
    render(<Harness onToggle={onToggle} />)
    await userEvent.type(search(), 'quick{Enter}')
    expect(onToggle).not.toHaveBeenCalled()
    expect(search()).toHaveValue('quick')
  })
  it('only the matches show when there are some, and only the create row when there are none (an empty Household)', async () => {
    render(<Harness onCreate={() => {}} />)
    await userEvent.type(search(), 'zzz')
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    expect(create()).toBeInTheDocument()
  })
})
