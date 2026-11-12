// TG-RW: Tag chips on the Recipe tile and the Recipe detail (docs/dev/design/tg-rw.md 3).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeTags } from './RecipeTags'

const colours: Record<string, string> = { roast: 'tomato', quick: 'sage' }
const colourOf = (n: string) => colours[n.toLowerCase()]
const list = () => screen.getByRole('list', { name: 'Tags' })
const items = () => within(list()).getAllByRole('listitem')

describe('RecipeTags', () => {
  it('renders nothing for no Tags', () => {
    render(<RecipeTags tags={[]} colourOf={colourOf} />)
    expect(screen.queryByRole('list', { name: 'Tags' })).toBeNull()
  })
  it('lists every Tag in the Recipe order when there is no limit', () => {
    render(<RecipeTags tags={['roast', 'quick', 'zebra']} colourOf={colourOf} />)
    expect(items().map((li) => li.textContent)).toEqual(['roast', 'quick', 'zebra'])
  })
  it('gives each chip its Tag colour and a dot; an unknown Tag is a neutral chip without one', () => {
    const { container } = render(<RecipeTags tags={['roast', 'quick', 'zebra']} colourOf={colourOf} />)
    const chips = Array.from(container.querySelectorAll<HTMLElement>('.chip'))
    expect(chips.map((c) => c.getAttribute('data-tag-colour'))).toEqual(['tomato', 'sage', null])
    expect(chips.map((c) => c.querySelector('.chip__dot') !== null)).toEqual([true, true, false])
  })
  it('finds the colour for the Recipe\'s own spelling ("Roast")', () => {
    const { container } = render(<RecipeTags tags={['Roast']} colourOf={colourOf} />)
    expect(container.querySelector('.chip')).toHaveAttribute('data-tag-colour', 'tomato')
  })
  it('with a limit of 2 shows the first two, then "+N" for the rest', () => {
    render(<RecipeTags tags={['a', 'b', 'c', 'd', 'e']} limit={2} colourOf={colourOf} />)
    expect(items().map((li) => li.textContent)).toEqual(['a', 'b', '+3'])
  })
  it('has no "+N" when the Tags fit', () => {
    render(<RecipeTags tags={['a', 'b']} limit={2} colourOf={colourOf} />)
    expect(items().map((li) => li.textContent)).toEqual(['a', 'b'])
  })
  it('the "+N" chip is neutral and not a button', () => {
    const { container } = render(<RecipeTags tags={['a', 'b', 'c']} limit={2} colourOf={colourOf} />)
    const more = items()[2]!
    expect(more.querySelector('[data-tag-colour]')).toBeNull()
    expect(within(more).queryByRole('button')).toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
  it('without colourOf every chip is neutral', () => {
    const { container } = render(<RecipeTags tags={['roast']} />)
    expect(container.querySelector('[data-tag-colour]')).toBeNull()
  })
  it('with onOpen each Tag is a button named after it, and opens that Tag', async () => {
    const onOpen = vi.fn()
    render(<RecipeTags tags={['roast', 'quick']} colourOf={colourOf} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'quick' }))
    expect(onOpen).toHaveBeenCalledWith('quick')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
