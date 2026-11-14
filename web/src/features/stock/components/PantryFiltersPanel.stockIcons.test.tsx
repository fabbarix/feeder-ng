// b8-pantry G2: the Food and Supplies toggle chips of the Filters panel lead with an icon, like the Kind chips; the names stay
// "Food" and "Supplies" (the icon is decorative).
import { render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PantryFiltersPanel } from './PantryFiltersPanel'

function view() {
  render(
    <PantryFiltersPanel
      open onClose={vi.fn()} anchorRef={createRef<HTMLElement>()} mode="places" status="all" onStatus={vi.fn()} hasLeftovers={false}
      leftovers={false} onLeftovers={vi.fn()} kinds={[]} onKind={vi.fn()} places={[]} lots={[]} selectedPlaces={[]} onPlace={vi.fn()}
      groupByPlace onGroupByPlace={vi.fn()} count={0} onClear={vi.fn()} stock="all" onStock={vi.fn()} hasSupplies
    />,
  )
  return within(screen.getByRole('group', { name: 'Food or Supplies' }))
}

describe('Food or Supplies chips', () => {
  it('each has a decorative icon and keeps its name', () => {
    const group = view()
    for (const name of ['Food', 'Supplies']) {
      const chip = group.getByRole('button', { name })
      const icon = chip.querySelector('svg')
      expect(icon).not.toBeNull()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })
  it('the two icons differ (a food glyph and the Supply glyph)', () => {
    const group = view()
    const paths = ['Food', 'Supplies'].map((n) => group.getByRole('button', { name: n }).querySelector('svg')?.innerHTML)
    expect(paths[0]).not.toBe(paths[1])
  })
})
