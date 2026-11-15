// B9-37 (RX-09, decision RX 6): the Recipe's Tags are removable chips plus "Add Tag", which opens the Tag chooser: the shared OptionList
// (multiple, with an "Add Tag" create row) in a sheet below 768 px and a popover from it. The old inline combobox (TagInput) is gone.
// Wording and structure follow mocks/rx-09-tag-chooser*.html. Footer: the mock says "Done" (GLOSSARY lists Done under Avoid for Cooked; the
// FiltersPanel avoids it): the label is the one constant below, so the user's answer is a one-line change.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import type { TagCount } from '../types'
import { TagChooser } from './TagChooser'

const DONE = 'Done'
const known: TagCount[] = [
  { name: 'quick', recipes: 3 },
  { name: 'family', recipes: 5 },
  { name: 'pasta', recipes: 1 },
  { name: 'spicy', recipes: 3 },
  { name: 'spiced rice', recipes: 1 },
  { name: 'weekend', recipes: 2 },
]
const colours: Record<string, string> = { quick: 'tomato', family: 'apricot', pasta: 'plum', spicy: 'tomato', weekend: 'sage' }
const colourOf = (n: string) => colours[n.toLowerCase()]

afterEach(() => vi.unstubAllGlobals())

function Harness({ initial = ['quick', 'family'], onChange, tags: all = known, colours: c = colourOf }: { initial?: string[]; onChange?: (t: string[]) => void; tags?: TagCount[]; colours?: ((n: string) => string | undefined) | undefined }) {
  const [tags, setTags] = useState(initial)
  return (
    <TagChooser
      tags={tags}
      known={all}
      colourOf={c}
      onChange={(next) => {
        setTags(next)
        onChange?.(next)
      }}
    />
  )
}
const addTag = () => screen.getByRole('button', { name: 'Add Tag' })
const open = async () => {
  await userEvent.click(addTag())
  return screen.getByRole('dialog', { name: 'Tags' })
}
const search = (dialog: HTMLElement) => within(dialog).getByRole('combobox', { name: 'Search or add a Tag' })

describe('the chosen Tags are removable chips', () => {
  it('each chip is one button "Remove Tag <name>" showing the Tag and a close icon, in its Tag colour', () => {
    render(<Harness />)
    const chip = screen.getByRole('button', { name: 'Remove Tag quick' })
    expect(chip).toHaveClass('chip')
    expect(chip).toHaveAttribute('data-removable')
    expect(chip).toHaveAttribute('data-tag-colour', 'tomato')
    expect(chip).toHaveTextContent('quick')
    expect(screen.getByRole('button', { name: 'Remove Tag family' })).toHaveAttribute('data-tag-colour', 'apricot')
  })

  it('removing a chip calls onChange without that Tag, keeping the others in order', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['quick', 'family', 'pasta']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tag family' }))
    expect(onChange).toHaveBeenCalledWith(['quick', 'pasta'])
    expect(screen.queryByRole('button', { name: 'Remove Tag family' })).toBeNull()
  })

  it('a Tag no one has saved is a neutral chip with "New"; its name stays "Remove Tag <name>"', () => {
    render(<Harness initial={['fresh', 'quick']} />)
    const fresh = screen.getByRole('button', { name: 'Remove Tag fresh' })
    expect(fresh).not.toHaveAttribute('data-tag-colour')
    expect(fresh).toHaveTextContent('New')
    expect(fresh).toHaveAttribute('data-kind', 'tag')
    expect(fresh.querySelector('.chip__dot')).toBeNull()
  })

  it('no "New" while the Tags are still loading (colourOf not given yet)', () => {
    render(<Harness initial={['fresh']} colours={undefined} />)
    expect(screen.getByRole('button', { name: 'Remove Tag fresh' })).not.toHaveTextContent('New')
  })

  it('finds the colour of a different spelling of a saved Tag', () => {
    render(<Harness initial={['Quick']} />)
    expect(screen.getByRole('button', { name: 'Remove Tag Quick' })).toHaveAttribute('data-tag-colour', 'tomato')
  })

  it('has no inline text field any more: the only way in is the Add Tag button', () => {
    render(<Harness />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('"Add Tag" is a secondary small button that says it opens a dialog; the chooser is closed at first', () => {
    render(<Harness />)
    expect(addTag()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(addTag()).toHaveAttribute('data-variant', 'secondary')
    expect(addTag()).toHaveAttribute('data-size', 'sm')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the group is named "Tags" and the root carries the class tag-chooser (the page-layout scenarios find it there)', () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('.tag-chooser')).not.toBeNull()
    expect(within(container.querySelector('.tag-chooser') as HTMLElement).getByRole('group', { name: 'Tags' })).toBeInTheDocument()
  })
})

describe.each([
  ['a sheet below 768 px', 390],
  ['a popover from 768 px', 1024],
])('the Tag chooser as %s', (_name, width) => {
  it('opens a dialog titled "Tags"; a sheet is a <dialog>, a popover is the shared .popover', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = await open()
    if (width < 768) expect(dialog.closest('dialog') ?? dialog).toBeInstanceOf(HTMLDialogElement)
    else expect(dialog).toHaveClass('popover')
  })

  it('holds a search combobox "Search or add a Tag" over a multiselectable listbox "Tags"', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = await open()
    expect(search(dialog)).toBeInTheDocument()
    expect(within(dialog).getByRole('listbox', { name: 'Tags' })).toHaveAttribute('aria-multiselectable', 'true')
  })

  it('lists the chosen Tags first with a check, then the others by name, each with its Recipe count and Tag dot', async () => {
    stubViewportWidth(width)
    render(<Harness initial={['weekend', 'quick']} />)
    const dialog = await open()
    const options = within(dialog).getAllByRole('option')
    expect(options.map((o) => o.querySelector('.select__label')?.textContent)).toEqual(['quick', 'weekend', 'family', 'pasta', 'spiced rice', 'spicy'])
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'true', 'false', 'false', 'false', 'false'])
    expect(options[0]!.querySelector('.select__meta')).toHaveTextContent('3 Recipes')
    expect(options[3]!.querySelector('.select__meta')).toHaveTextContent('1 Recipe')
    expect(options[2]!.querySelector('.tag-dot')).toHaveAttribute('data-tag-colour', 'apricot')
  })

  it('choosing an option toggles the Tag, the chip row updates live and the chooser stays open', async () => {
    stubViewportWidth(width)
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('option', { name: /^pasta/ }))
    expect(onChange).toHaveBeenLastCalledWith(['quick', 'family', 'pasta'])
    expect(screen.getByRole('dialog', { name: 'Tags' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Tag pasta' })).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Tags' })).getByRole('option', { name: /^quick/ }))
    expect(onChange).toHaveBeenLastCalledWith(['family', 'pasta'])
  })

  it('says what is chosen, under the list: "Chosen: quick, family", and keeps it current', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = await open()
    expect(within(dialog).getByText('Chosen: quick, family')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('option', { name: /^weekend/ }))
    expect(within(dialog).getByText('Chosen: quick, family, weekend')).toBeInTheDocument()
  })

  it('typing a word that is not a Tag adds a last option "Add Tag “spic”" that says the new Tag gets the next Tag colour', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = await open()
    await userEvent.type(search(dialog), 'spic')
    const options = within(dialog).getAllByRole('option')
    const create = options[options.length - 1]!
    expect(create).toHaveClass('select__option--create')
    expect(create).toHaveAccessibleName(/Add Tag .spic./)
    expect(create).toHaveTextContent('New Tag, gets the next Tag colour')
    expect(options.slice(0, -1).map((o) => o.querySelector('.select__label')?.textContent)).toEqual(['spiced rice', 'spicy'])
  })

  it('choosing the create row adds the Tag (a neutral chip with "New"), clears the search and stays open', async () => {
    stubViewportWidth(width)
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const dialog = await open()
    await userEvent.type(search(dialog), 'brand new')
    await userEvent.click(within(dialog).getByRole('option', { name: /Add Tag .brand new./ }))
    expect(onChange).toHaveBeenLastCalledWith(['quick', 'family', 'brand new'])
    expect(search(screen.getByRole('dialog', { name: 'Tags' }))).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Remove Tag brand new' })).toHaveTextContent('New')
  })

  it('no create row when the query is a Tag already, in any case', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = await open()
    await userEvent.type(search(dialog), 'QUICK')
    expect(within(dialog).queryByRole('option', { name: /Add Tag/ })).toBeNull()
  })

  it('Enter with no active option adds the exact match in its saved spelling, or the typed words; a comma does the same', async () => {
    stubViewportWidth(width)
    const onChange = vi.fn()
    render(<Harness initial={[]} onChange={onChange} />)
    const dialog = await open()
    await userEvent.type(search(dialog), 'PASTA{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['pasta'])
    await userEvent.type(search(dialog), 'brand new{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['pasta', 'brand new'])
    await userEvent.type(search(dialog), 'zesty,')
    expect(onChange).toHaveBeenLastCalledWith(['pasta', 'brand new', 'zesty'])
  })

  it('arrows move to an option and Enter toggles it (the create row included)', async () => {
    stubViewportWidth(width)
    const onChange = vi.fn()
    render(<Harness initial={[]} onChange={onChange} />)
    const dialog = await open()
    await userEvent.type(search(dialog), 'spic')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}') // spiced rice, spicy, Add Tag "spic"
    expect(onChange).toHaveBeenLastCalledWith(['spic'])
  })

  it('"Done" closes it and focus returns to "Add Tag"', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = await open()
    const done = within(dialog).getByRole('button', { name: DONE })
    expect(done).toHaveAttribute('data-variant', 'secondary')
    expect(done).toHaveAttribute('data-size', 'sm')
    await userEvent.click(done)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(addTag()).toHaveFocus()
  })

  it('Escape closes it and focus returns to "Add Tag"', async () => {
    stubViewportWidth(width)
    render(<Harness />)
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(addTag()).toHaveFocus()
  })

  it('an empty Household: before typing it says "No Tags yet. Type a name to add one."; after typing only the create row is offered', async () => {
    stubViewportWidth(width)
    render(<Harness initial={[]} tags={[]} />)
    const dialog = await open()
    expect(within(dialog).getByText('No Tags yet. Type a name to add one.')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('option')).toHaveLength(0)
    await userEvent.type(search(dialog), 'weekend')
    const options = within(dialog).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveClass('select__option--create')
  })
})
