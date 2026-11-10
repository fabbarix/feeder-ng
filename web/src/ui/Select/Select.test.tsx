import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultiSelect, Select, type SelectProps } from './Select'
import type { SelectOption } from './lib'

const fruit: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
]
const many: SelectOption[] = Array.from({ length: 10 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }))

function Controlled(props: Partial<SelectProps> & { initial?: string | null; onPick?: (v: string) => void }) {
  const [value, setValue] = useState<string | null>(props.initial ?? null)
  const { initial: _i, onPick, ...rest } = props
  return (
    <Select
      label="Fruit"
      options={fruit}
      {...rest}
      value={value}
      onChange={(v) => {
        setValue(v)
        onPick?.(v)
      }}
    />
  )
}

const trigger = () => screen.getByRole('combobox', { name: /Fruit/ })

describe('Select trigger', () => {
  it('is a labelled combobox showing the placeholder, then the selected label', () => {
    const { rerender } = render(<Select label="Fruit" placeholder="Choose a fruit" options={fruit} value={null} onChange={() => {}} />)
    expect(trigger()).toHaveTextContent('Choose a fruit')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox')
    rerender(<Select label="Fruit" options={fruit} value="banana" onChange={() => {}} />)
    expect(trigger()).toHaveTextContent('Banana')
  })

  it('shows helper and error text linked by aria-describedby; marks invalid', () => {
    render(<Select label="Fruit" helper="Pick one" error="Required" options={fruit} value={null} onChange={() => {}} />)
    expect(trigger()).toHaveAccessibleDescription(/Pick one/)
    expect(trigger()).toHaveAccessibleDescription(/Required/)
    expect(trigger()).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not open when disabled', async () => {
    render(<Select label="Fruit" disabled options={fruit} value={null} onChange={() => {}} />)
    await userEvent.click(trigger())
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('Select listbox (popover, >= 768 px)', () => {
  it('opens on click: listbox with options, aria-controls and aria-expanded', async () => {
    render(<Controlled initial="banana" />)
    await userEvent.click(trigger())
    const list = screen.getByRole('listbox')
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(trigger()).toHaveAttribute('aria-controls', list.id)
    expect(within(list).getAllByRole('option').map((x) => x.textContent)).toEqual(['Apple', 'Apricot', 'Banana', 'Blueberry'])
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false')
  })

  it.each(['{Enter}', ' ', '{ArrowDown}', '{ArrowUp}'])('opens from the keyboard with %j', async (key) => {
    render(<Controlled />)
    trigger().focus()
    await userEvent.keyboard(key)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('arrows move the active option (aria-activedescendant); Enter selects, closes and refocuses the trigger', async () => {
    const onPick = vi.fn()
    render(<Controlled onPick={onPick} />)
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}')
    const active = () => document.getElementById(document.activeElement?.getAttribute('aria-activedescendant') ?? '')
    expect(active()).toHaveTextContent('Apple')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(active()).toHaveTextContent('Banana')
    await userEvent.keyboard('{ArrowUp}')
    expect(active()).toHaveTextContent('Apricot')
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('apricot')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveTextContent('Apricot')
  })

  it('opens on the selected option; Home and End jump to the ends', async () => {
    render(<Controlled initial="banana" />)
    await userEvent.click(trigger())
    const active = () => document.getElementById(document.activeElement?.getAttribute('aria-activedescendant') ?? '')
    expect(active()).toHaveTextContent('Banana')
    await userEvent.keyboard('{End}')
    expect(active()).toHaveTextContent('Blueberry')
    await userEvent.keyboard('{Home}')
    expect(active()).toHaveTextContent('Apple')
  })

  it('type-ahead jumps to the matching option, and a repeated letter cycles', async () => {
    render(<Controlled />)
    await userEvent.click(trigger())
    const active = () => document.getElementById(document.activeElement?.getAttribute('aria-activedescendant') ?? '')
    await userEvent.keyboard('b')
    expect(active()).toHaveTextContent('Banana')
    await userEvent.keyboard('b')
    expect(active()).toHaveTextContent('Blueberry')
  })

  it('Escape closes without changing the value and refocuses the trigger', async () => {
    const onPick = vi.fn()
    render(<Controlled initial="apple" onPick={onPick} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(trigger()).toHaveTextContent('Apple')
    expect(trigger()).toHaveFocus()
  })

  it('Tab closes without selecting', async () => {
    const onPick = vi.fn()
    render(<><Controlled onPick={onPick} /><button>after</button></>)
    await userEvent.click(trigger())
    await userEvent.tab()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('clicking an option selects it; clicking outside closes', async () => {
    const onPick = vi.fn()
    render(<><Controlled onPick={onPick} /><p>outside</p></>)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('option', { name: 'Blueberry' }))
    expect(onPick).toHaveBeenCalledWith('blueberry')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByText('outside'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('disabled options cannot be chosen and are skipped by the arrows', async () => {
    const onPick = vi.fn()
    const options = [fruit[0]!, { ...fruit[1]!, disabled: true }, fruit[2]!]
    render(<Controlled options={options} onPick={onPick} />)
    await userEvent.click(trigger())
    expect(screen.getByRole('option', { name: 'Apricot' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith('banana')
  })

  it('renders group subheaders as labelled groups, plus meta and leading content', async () => {
    const options: SelectOption[] = [
      { value: 'a', label: 'Breakfast', group: 'Monday', meta: '07:30', leading: <span data-testid="lead-a">☀</span> },
      { value: 'b', label: 'Dinner', group: 'Tuesday', meta: '19:30' },
    ]
    render(<Controlled options={options} />)
    await userEvent.click(trigger())
    expect(screen.getByRole('group', { name: 'Monday' })).toContainElement(screen.getByRole('option', { name: /Breakfast/ }))
    expect(screen.getByRole('group', { name: 'Tuesday' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Breakfast/ })).toHaveTextContent('07:30')
    expect(screen.getByTestId('lead-a')).toBeInTheDocument()
  })
})

describe('Select search, filters, sort, create', () => {
  it('shows a search field only when there are more than 8 options (or searchable is forced)', async () => {
    const { unmount } = render(<Controlled options={fruit} />)
    await userEvent.click(trigger())
    expect(screen.queryByRole('searchbox')).toBeNull()
    unmount()
    render(<Controlled options={many} />)
    await userEvent.click(trigger())
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('typing filters the options; arrows and Enter pick the first match', async () => {
    const onPick = vi.fn()
    render(<Controlled options={many} onPick={onPick} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('item 7')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('v7')
  })

  it('names the search from the entity and reports an empty result', async () => {
    render(<Controlled options={many} entityName="Recipe" />)
    await userEvent.click(trigger())
    expect(screen.getByRole('searchbox', { name: 'Search Recipe' })).toBeInTheDocument()
    await userEvent.keyboard('xyz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText("No Recipe matches 'xyz'")).toBeInTheDocument()
  })

  it('offers a Create row for a non-matching query and calls onCreate', async () => {
    const onCreate = vi.fn()
    render(<Controlled options={many} entityName="Ingredient" onCreate={onCreate} createLabel={(q) => `Create Ingredient "${q}"`} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('saffron')
    await userEvent.click(screen.getByRole('option', { name: 'Create Ingredient "saffron"' }))
    expect(onCreate).toHaveBeenCalledWith('saffron')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not offer Create when the query equals an existing label', async () => {
    render(<Controlled options={many} onCreate={() => {}} createLabel={(q) => `Create "${q}"`} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('Item 3')
    expect(screen.queryByRole('option', { name: 'Create "Item 3"' })).toBeNull()
  })

  it('filter chips narrow the list (aria-pressed) and combine with search', async () => {
    const options: SelectOption[] = [
      { value: 'a', label: 'Aubergine bake', keywords: ['veg'] },
      { value: 'b', label: 'Beef stew' },
      { value: 'c', label: 'Chickpea curry', keywords: ['veg'] },
    ]
    render(<Controlled options={options} searchable filters={[{ id: 'veg', label: 'Vegetarian', predicate: (x) => x.keywords?.includes('veg') ?? false }]} />)
    await userEvent.click(trigger())
    const chip = screen.getByRole('button', { name: 'Vegetarian' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('option').map((x) => x.textContent)).toEqual(['Aubergine bake', 'Chickpea curry'])
    await userEvent.keyboard('curry')
    expect(screen.getAllByRole('option').map((x) => x.textContent)).toEqual(['Chickpea curry'])
  })

  it('the sort button cycles through the sorts and reorders', async () => {
    const options: SelectOption[] = [
      { value: 'b', label: 'Bread', meta: '2' },
      { value: 'a', label: 'Apple', meta: '3' },
    ]
    const sorts = [
      { id: 'name', label: 'Name', compare: (x: SelectOption, y: SelectOption) => x.label.localeCompare(y.label) },
      { id: 'meta', label: 'Newest', compare: (x: SelectOption, y: SelectOption) => (y.meta ?? '').localeCompare(x.meta ?? '') },
    ]
    render(<Controlled options={options} sorts={sorts} />)
    await userEvent.click(trigger())
    expect(screen.getAllByRole('option').map((x) => x.textContent?.slice(0, 5))).toEqual(['Apple', 'Bread'])
    await userEvent.click(screen.getByRole('button', { name: 'Sort: Name' }))
    expect(screen.getByRole('button', { name: 'Sort: Newest' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Apple')
    await userEvent.click(screen.getByRole('button', { name: 'Sort: Newest' }))
    expect(screen.getByRole('button', { name: 'Sort: Name' })).toBeInTheDocument()
  })
})

describe('Select on a phone (< 768 px): bottom sheet', () => {
  afterEach(() => vi.unstubAllGlobals())
  const phone = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))

  it('lists the options in a modal dialog named by the label; picking closes and refocuses the trigger', async () => {
    phone()
    const onPick = vi.fn()
    render(<Controlled onPick={onPick} />)
    await userEvent.click(trigger())
    const sheet = screen.getByRole('dialog', { name: 'Fruit' })
    expect(sheet.tagName).toBe('DIALOG')
    await userEvent.click(within(sheet).getByRole('option', { name: 'Banana' }))
    expect(onPick).toHaveBeenCalledWith('banana')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('Escape closes the sheet and refocuses the trigger', async () => {
    phone()
    render(<Controlled />)
    await userEvent.click(trigger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger()).toHaveFocus()
  })
})

describe('MultiSelect', () => {
  function Multi(props: { initial?: string[]; onChange?: (v: string[]) => void }) {
    const [values, setValues] = useState<string[]>(props.initial ?? [])
    return <MultiSelect label="Fruits" options={fruit} values={values} onChange={(v) => { setValues(v); props.onChange?.(v) }} />
  }
  const multi = () => screen.getByRole('combobox', { name: /Fruits/ })

  it('is a multiselectable listbox; picking toggles and keeps the list open', async () => {
    const onChange = vi.fn()
    render(<Multi onChange={onChange} />)
    await userEvent.click(multi())
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true')
    await userEvent.click(screen.getByRole('option', { name: 'Apple' }))
    await userEvent.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).toHaveBeenLastCalledWith(['apple', 'banana'])
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'Apple' }))
    expect(onChange).toHaveBeenLastCalledWith(['banana'])
  })

  it('Enter toggles the active option; the trigger summarises the selection', async () => {
    render(<Multi initial={['apple', 'banana']} />)
    expect(multi()).toHaveTextContent('Apple, Banana')
    await userEvent.click(multi())
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByRole('option', { name: 'Blueberry' })).toHaveAttribute('aria-selected', 'true')
  })
})
