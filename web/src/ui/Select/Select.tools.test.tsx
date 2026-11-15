// B9-15 (SET-06): the filter chips of an open Select are one line: active filters first, then as many others as fit, then "+N"
// (aria-expanded, named "+N more filters": main session ruling, the name starts with the visible "+N", WCAG 2.5.3 label in name); "+N" expands the line in place and the expanded line ends with "Fewer"; the sort IconButton keeps
// its place at the end; each chip is capped (12 rem) and carries its full text in its title. The fit is useFittingChips (ui/lib).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

const fit: { visible: number | null } = { visible: null }
vi.mock('../lib/useFittingChips', async (orig) => ({
  ...(await orig<typeof import('../lib/useFittingChips')>()),
  useFittingChips: (_line: unknown, count: number) => {
    const visible = Math.min(fit.visible ?? count, count)
    return { visible, hidden: count - visible }
  },
}))

const options = [
  { value: 1, label: 'Pasta bake', keywords: ['pasta', 'quick', 'family', 'weekend', 'veg'] },
  { value: 2, label: 'Salad', keywords: ['quick'] },
]
const tags = ['Pasta', 'Quick', 'Family', 'Weekend', 'Vegetarian']
const filters = tags.map((t) => ({ id: t, label: t, predicate: () => true }))
const sorts = [
  { id: 'name', label: 'Name', compare: () => 0 },
  { id: 'time', label: 'Time', compare: () => 0 },
]
const open = async (props: Record<string, unknown> = {}) => {
  render(<Select label="Recipe" options={options} filters={filters} sorts={sorts} value={null} onChange={() => {}} {...props} />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Recipe' }))
}
const toolbar = () => document.querySelector<HTMLElement>('.select__tools')!

beforeEach(() => {
  fit.visible = null
})

describe('the Select filter line', () => {
  it('shows every filter and no "+N" when they all fit', async () => {
    await open()
    expect(within(toolbar()).getAllByRole('button').filter((b) => tags.includes(b.textContent ?? ''))).toHaveLength(5)
    expect(screen.queryByRole('button', { name: /more filter/ })).toBeNull()
  })
  it('when they do not fit it shows "+N" named "+N more filters", collapsed', async () => {
    fit.visible = 2
    await open()
    const more = screen.getByRole('button', { name: '+3 more filters' })
    expect(more).toHaveTextContent('+3')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(within(toolbar()).queryByRole('button', { name: 'Vegetarian' })).toBeNull()
    expect(toolbar()).not.toHaveAttribute('data-expanded', 'true')
  })
  it('active filters come first, so a chosen one is never in "+N"', async () => {
    fit.visible = 2
    await open()
    await userEvent.click(screen.getByRole('button', { name: '+3 more filters' }))
    await userEvent.click(within(toolbar()).getByRole('button', { name: 'Vegetarian' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fewer' }))
    const names = within(toolbar()).getAllByRole('button').map((b) => b.textContent)
    expect(names.slice(0, 2)).toEqual(['Vegetarian', 'Pasta'])
  })
  it('"+N" expands the line in place, every chip shows, and the expanded line ends with "Fewer"; focus stays on that one button', async () => {
    fit.visible = 2
    await open()
    const more = screen.getByRole('button', { name: '+3 more filters' })
    more.focus()
    await userEvent.keyboard('{Enter}')
    expect(toolbar()).toHaveAttribute('data-expanded', 'true')
    for (const t of tags) expect(within(toolbar()).getByRole('button', { name: t })).toBeInTheDocument()
    const fewer = screen.getByRole('button', { name: 'Fewer' })
    expect(fewer).toHaveAttribute('aria-expanded', 'true')
    expect(fewer).toHaveFocus()
    expect(fewer).toBe(more)
    const buttons = within(toolbar()).getAllByRole('button')
    expect(buttons.indexOf(fewer)).toBe(buttons.length - 2)
  })
  it('"Fewer" collapses again and focus stays on the button', async () => {
    fit.visible = 2
    await open()
    await userEvent.click(screen.getByRole('button', { name: '+3 more filters' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fewer' }))
    const more = screen.getByRole('button', { name: '+3 more filters' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveFocus()
  })
  it('the sort IconButton keeps its place as the last control of the line, expanded or not', async () => {
    fit.visible = 2
    await open()
    const last = () => within(toolbar()).getAllByRole('button').at(-1)!
    expect(last()).toHaveAccessibleName('Sort: Name')
    await userEvent.click(screen.getByRole('button', { name: '+3 more filters' }))
    expect(last()).toHaveAccessibleName('Sort: Name')
  })
  it('each chip carries its full text in its title', async () => {
    await open()
    expect(within(toolbar()).getByRole('button', { name: 'Vegetarian' })).toHaveAttribute('title', 'Vegetarian')
  })
  it('the expanded state resets when the list is opened again', async () => {
    fit.visible = 2
    await open()
    await userEvent.click(screen.getByRole('button', { name: '+3 more filters' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('combobox', { name: 'Recipe' }))
    expect(screen.getByRole('button', { name: '+3 more filters' })).toHaveAttribute('aria-expanded', 'false')
  })
})
