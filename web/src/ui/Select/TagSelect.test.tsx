// TagSelect (TG-UI): the shared Select with a colour dot and the Recipe count on each option, Tags ordered by name.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TagSelect, tagOptions, type TagChoice } from './TagSelect'

const tags: TagChoice[] = [
  { id: 3, name: 'Roast', colour: 'olive', recipes: 0 },
  { id: 1, name: 'pasta', colour: 'apricot', recipes: 1 },
  { id: 2, name: 'Fish', colour: 'teal', recipes: 12 },
]
const open = (name: RegExp | string) => userEvent.click(screen.getByRole('combobox', { name }))
const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent ?? '')

describe('tagOptions', () => {
  it('orders by name, case ignored, with numeric ids as values', () => {
    expect(tagOptions(tags).map((o) => [o.value, o.label])).toEqual([[2, 'Fish'], [1, 'pasta'], [3, 'Roast']])
  })
  it('meta is the Recipe count: plural, singular and "No Recipes yet"', () => {
    expect(tagOptions(tags).map((o) => o.meta)).toEqual(['12 Recipes', '1 Recipe', 'No Recipes yet'])
  })
  it('has no meta when the count is unknown', () => {
    expect(tagOptions([{ id: 1, name: 'Fish', colour: 'teal' }])[0]!.meta).toBeUndefined()
  })
  it('leaves out the excluded Tag', () => {
    expect(tagOptions(tags, 2).map((o) => o.value)).toEqual([1, 3])
  })
  it('a dot leads each option', () => {
    for (const o of tagOptions(tags)) expect(o.leading).toBeTruthy()
  })
})

describe('TagSelect', () => {
  it('is a combobox; the listbox shows every Tag by name with its count', async () => {
    render(<TagSelect label="Tag" tags={tags} value={null} onChange={() => {}} />)
    await open('Tag')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(optionNames()).toEqual(['Fish12 Recipes', 'pasta1 Recipe', 'RoastNo Recipes yet'])
  })
  it('draws each option\'s Tag colour dot, decorative', async () => {
    render(<TagSelect label="Tag" tags={tags} value={null} onChange={() => {}} />)
    await open('Tag')
    const dots = screen.getAllByRole('option').map((o) => o.querySelector('.tag-dot'))
    expect(dots.map((d) => d?.getAttribute('data-tag-colour'))).toEqual(['teal', 'apricot', 'olive'])
    for (const d of dots) expect(d).toHaveAttribute('aria-hidden', 'true')
  })
  it('shows the chosen Tag in the closed trigger', () => {
    render(<TagSelect label="Tag" tags={tags} value={2} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /Tag/ })).toHaveTextContent('Fish')
  })
  it('marks the chosen option with aria-selected', async () => {
    render(<TagSelect label="Tag" tags={tags} value={1} onChange={() => {}} />)
    await open('Tag')
    expect(screen.getByRole('option', { name: /pasta/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Fish/ })).toHaveAttribute('aria-selected', 'false')
  })
  it('picks a Tag and answers its id', async () => {
    const onChange = vi.fn()
    render(<TagSelect label="Tag" tags={tags} value={null} onChange={onChange} />)
    await open('Tag')
    await userEvent.click(screen.getByRole('option', { name: /Roast/ }))
    expect(onChange).toHaveBeenCalledWith(3)
  })
  it('works from the keyboard: ArrowDown, Enter', async () => {
    const onChange = vi.fn()
    render(<TagSelect label="Tag" tags={tags} value={null} onChange={onChange} />)
    screen.getByRole('combobox', { name: /Tag/ }).focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(1)
  })
  it('type-ahead jumps to the matching Tag', async () => {
    const onChange = vi.fn()
    render(<TagSelect label="Tag" tags={tags} value={null} onChange={onChange} />)
    await open('Tag')
    await userEvent.keyboard('r{Enter}')
    expect(onChange).toHaveBeenCalledWith(3)
  })
  it('excludes a Tag from the list (Merge into…)', async () => {
    render(<TagSelect label="Merge into" tags={tags} value={null} onChange={() => {}} exclude={2} />)
    await open('Merge into')
    expect(optionNames()).toEqual(['pasta1 Recipe', 'RoastNo Recipes yet'])
  })

  describe('with many Tags', () => {
    const many: TagChoice[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 10, name: `Tag ${String.fromCharCode(97 + i)}`, colour: 'sky', recipes: i }))
    it('shows a search named for the entity, narrows the list and reports an empty result', async () => {
      render(<TagSelect label="Tag" tags={many} value={null} onChange={() => {}} />)
      await open('Tag')
      const search = screen.getByRole('searchbox', { name: 'Search Tag' })
      await userEvent.type(search, 'tag c')
      expect(optionNames().map((n) => n.replace(/\d+ Recipes?|No Recipes yet/, ''))).toEqual(['Tag c'])
      await userEvent.clear(search)
      await userEvent.type(search, 'xyz')
      expect(screen.getByText("No Tag matches 'xyz'")).toBeInTheDocument()
    })
  })

  it('passes the field props on: helper and error', () => {
    render(<TagSelect label="Tag" tags={tags} value={null} onChange={() => {}} helper="Which Tag" error="Choose a Tag" />)
    expect(screen.getByText('Choose a Tag')).toBeInTheDocument()
    expect(screen.getByText('Which Tag')).toBeInTheDocument()
  })

  it('a controlled TagSelect updates its trigger after picking', async () => {
    function C() {
      const [v, setV] = useState<number | null>(null)
      return <TagSelect label="Tag" tags={tags} value={v} onChange={setV} />
    }
    render(<C />)
    await open('Tag')
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Fish/ }))
    expect(screen.getByRole('combobox', { name: /Tag/ })).toHaveTextContent('Fish')
  })
})
