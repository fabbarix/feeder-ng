// hf-recipes-filter: the line of active filter chips under the header rows (docs/design/recipes-filter.md 4, 5.2, 5.4, 8).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActiveFilterChip } from '../lib/recipeFilters'

const fit = vi.hoisted(() => ({ visible: -1 }))
vi.mock('../hooks/useFittingChips', () => ({
  useFittingChips: (_ref: unknown, count: number) =>
    fit.visible < 0 ? { visible: count, hidden: 0 } : { visible: fit.visible, hidden: count - fit.visible },
}))

import { ActiveFilterChips } from './ActiveFilterChips'

const chips: ActiveFilterChip[] = [
  { key: 'course', label: 'Main', removeLabel: 'Remove Course: Main' },
  { key: 'tag', label: 'fish', removeLabel: 'Remove Tag: fish', tagColour: 'teal' },
]

describe('ActiveFilterChips', () => {
  it('renders nothing without a chip', () => {
    fit.visible = -1
    const { container } = render(<ActiveFilterChips chips={[]} onRemove={() => {}} onMore={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('is one group "Active filters" of removable chips naming the Course and the Tag', () => {
    fit.visible = -1
    const { container } = render(<ActiveFilterChips chips={chips} onRemove={() => {}} onMore={() => {}} />)
    expect(screen.getByRole('group', { name: 'Active filters' })).toHaveClass('recipe-filters__chips')
    const course = screen.getByRole('button', { name: 'Remove Course: Main' })
    const tag = screen.getByRole('button', { name: 'Remove Tag: fish' })
    expect(course).toHaveTextContent('Main')
    expect(course).not.toHaveAttribute('data-tag-colour')
    expect(tag).toHaveTextContent('fish')
    expect(tag).toHaveAttribute('data-tag-colour', 'teal')
    expect(container.querySelectorAll('.chip[data-removable]')).toHaveLength(2)
  })
  it('a chip removes its filter', async () => {
    fit.visible = -1
    const onRemove = vi.fn()
    render(<ActiveFilterChips chips={chips} onRemove={onRemove} onMore={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tag: fish' }))
    expect(onRemove).toHaveBeenCalledWith('tag')
  })
  it('collapses what does not fit into "+N", which opens the panel', async () => {
    fit.visible = 1
    const onMore = vi.fn()
    render(<ActiveFilterChips chips={chips} onRemove={() => {}} onMore={onMore} />)
    expect(screen.getByRole('button', { name: 'Remove Course: Main' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Tag: fish' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Show 1 more filter' })
    expect(more).toHaveTextContent('+1')
    await userEvent.click(more)
    expect(onMore).toHaveBeenCalledTimes(1)
  })
  it('names "+N" in the plural', () => {
    fit.visible = 1
    render(<ActiveFilterChips chips={[...chips, { key: 'tag', label: 'x', removeLabel: 'Remove Tag: x' }]} onRemove={() => {}} onMore={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show 2 more filters' })).toHaveTextContent('+2')
  })
  it('has no "+N" when every chip fits', () => {
    fit.visible = -1
    render(<ActiveFilterChips chips={chips} onRemove={() => {}} onMore={() => {}} />)
    expect(screen.queryByRole('button', { name: /more filter/ })).toBeNull()
  })
})
