// The line of active filter chips under a filter header's rows (docs/design/recipes-filter.md 4, 5.2, 5.4, 8; pantry-filter.md 5).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilterChip } from './types'

const fit = vi.hoisted(() => ({ visible: -1 }))
vi.mock('./useFittingChips', () => ({
  measureChipLine: () => ({ available: 0, widths: [], gap: 0, plusWidth: 0 }),
  useFittingChips: (_ref: unknown, count: number) =>
    fit.visible < 0 ? { visible: count, hidden: 0 } : { visible: fit.visible, hidden: count - fit.visible },
}))

import { ActiveFilterChips } from './ActiveFilterChips'

const chips: FilterChip<'course' | 'tag'>[] = [
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
    expect(screen.getByRole('group', { name: 'Active filters' })).toHaveClass('filter-chips')
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
    render(<ActiveFilterChips chips={[...chips, { key: 'tag' as const, label: 'x', removeLabel: 'Remove Tag: x' }]} onRemove={() => {}} onMore={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show 2 more filters' })).toHaveTextContent('+2')
  })
  it('has no "+N" when every chip fits', () => {
    fit.visible = -1
    render(<ActiveFilterChips chips={chips} onRemove={() => {}} onMore={() => {}} />)
    expect(screen.queryByRole('button', { name: /more filter/ })).toBeNull()
  })

  describe('round 2: the measuring copy (docs/design/recipes-filter.md 5.4, 13.1)', () => {
    it('is inert and hidden, and holds the real removable chips, one per filter, plus a "+N"', () => {
      fit.visible = 1
      const { container } = render(<ActiveFilterChips chips={chips} onRemove={() => {}} onMore={() => {}} />)
      const copy = container.querySelector('.filter-chips__measure')!
      expect(copy).not.toBeNull()
      expect(copy).toHaveAttribute('inert')
      expect(copy).toHaveAttribute('aria-hidden', 'true')
      const copies = copy.querySelectorAll('.chip[data-removable]')
      expect([...copies].map((c) => c.querySelector('.chip__label')?.textContent)).toEqual(['Main', 'fish'])
      for (const c of copies) expect(c.querySelector('.chip__remove svg')).not.toBeNull()
      expect(copy.querySelector('.filter-chips__more')).not.toBeNull()
    })
    it('its chips are not in the accessibility tree or the tab order (only the shown chips are)', () => {
      fit.visible = -1
      render(<ActiveFilterChips chips={chips} onRemove={() => {}} onMore={() => {}} />)
      expect(screen.getAllByRole('button', { name: 'Remove Tag: fish' })).toHaveLength(1)
    })
    it('adds no hand-made width to the measured chips', () => {
      const raw = import.meta.glob(['./ActiveFilterChips.tsx', './useFittingChips.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
      for (const [path, text] of Object.entries(raw)) {
        expect(text, path).not.toMatch(/ALLOWANCE/i)
        expect(text, path).not.toMatch(/\bw\s*\+\s*\d+/)
      }
    })
  })
})
