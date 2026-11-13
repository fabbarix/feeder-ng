// pantry-filter: the searchable Storage Place list of the Filters panel (docs/design/pantry-filter.md 4.4, 4.6, 8).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import { PlaceFilterList } from './PlaceFilterList'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]
const lots = [makeLot({ id: 1, storagePlaceId: 2 }), makeLot({ id: 2, storagePlaceId: 2 }), makeLot({ id: 3, storagePlaceId: 1 })]

describe('PlaceFilterList', () => {
  it('a search combobox over a listbox of every Storage Place by name, Not sorted last, each with its Lot count and kind icon', () => {
    render(<PlaceFilterList places={places} lots={lots} selected={[1]} onToggle={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Search Storage Places' })).toHaveAttribute('placeholder', 'Search Storage Places')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Garage Freezer2 Stock Lots', 'Kitchen Pantry1 Stock Lot', 'Not sortedNo Stock Lots'])
    expect(screen.getByRole('listbox', { name: 'Filter by Storage Place' })).toHaveAttribute('aria-multiselectable', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    for (const o of options) expect(o.querySelector('svg')).not.toBeNull()
  })
  it('a click toggles a Storage Place', async () => {
    const onToggle = vi.fn()
    render(<PlaceFilterList places={places} lots={lots} selected={[]} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('option', { name: /Garage Freezer/ }))
    expect(onToggle).toHaveBeenCalledWith(2)
  })
  it('says when no Storage Place matches', async () => {
    render(<PlaceFilterList places={places} lots={lots} selected={[]} onToggle={() => {}} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Storage Places' }), 'attic')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText("No Storage Place matches 'attic'")).toBeInTheDocument()
  })
})
