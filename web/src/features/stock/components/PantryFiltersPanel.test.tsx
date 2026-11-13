// pantry-filter: the Pantry's Filters panel (docs/design/pantry-filter.md 4, 7, 8, 9).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import { PantryFiltersPanel, type PantryFiltersPanelProps } from './PantryFiltersPanel'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]

function view(over: Partial<PantryFiltersPanelProps> = {}) {
  const props: PantryFiltersPanelProps = {
    open: true, onClose: vi.fn(), anchorRef: createRef<HTMLElement>(), mode: 'places', status: 'all', onStatus: vi.fn(),
    hasLeftovers: true, leftovers: false, onLeftovers: vi.fn(), kinds: [], onKind: vi.fn(), places, lots: [makeLot({ id: 1, storagePlaceId: 2 })],
    selectedPlaces: [], onPlace: vi.fn(), groupByPlace: true, onGroupByPlace: vi.fn(), count: 0, onClear: vi.fn(), ...over,
  }
  render(<PantryFiltersPanel {...props} />)
  return { props, dialog: screen.getByRole('dialog', { name: 'Filters' }) }
}

afterEach(() => vi.unstubAllGlobals())

describe.each([390, 1024])('PantryFiltersPanel at %i px', (width) => {
  it('By Storage Place: Show, Kind, Storage Place and the grouping switch, in that order', () => {
    stubViewportWidth(width)
    const { dialog } = view()
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Show', 'Kind', 'Storage Place'])
    const show = within(dialog).getByRole('group', { name: 'Show' })
    expect(within(show).getAllByRole('button').map((b) => b.textContent)).toEqual(['Use soon', 'Spoiled', 'Leftovers'])
    expect(within(dialog).getByRole('group', { name: 'Filter by kind' })).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Search Storage Places' })).toBeInTheDocument()
    expect(within(dialog).getByRole('listbox', { name: 'Filter by Storage Place' })).toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: 'Group by Storage Place' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Show Stock' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })
})

describe('PantryFiltersPanel', () => {
  it('has no "All": nothing pressed means all of Stock', () => {
    const { dialog } = view()
    expect(within(dialog).queryByRole('button', { name: 'All' })).toBeNull()
    for (const b of within(within(dialog).getByRole('group', { name: 'Show' })).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
  })
  it('presses the status in force and Leftovers, and hands each press on', async () => {
    const { dialog, props } = view({ status: 'spoiled', leftovers: true, count: 2 })
    const show = within(dialog).getByRole('group', { name: 'Show' })
    expect(within(show).getByRole('button', { name: 'Spoiled' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(show).getByRole('button', { name: 'Leftovers' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(show).getByRole('button', { name: 'Use soon' }))
    expect(props.onStatus).toHaveBeenCalledWith('useSoon')
    await userEvent.click(within(show).getByRole('button', { name: 'Leftovers' }))
    expect(props.onLeftovers).toHaveBeenCalledWith(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear filters' }))
    expect(props.onClear).toHaveBeenCalled()
  })
  it('Leftovers is offered only while the Pantry holds frozen Leftovers', () => {
    const { dialog } = view({ hasLeftovers: false })
    expect(within(dialog).queryByRole('button', { name: 'Leftovers' })).toBeNull()
  })
  it('kinds and Storage Places toggle, several at once', async () => {
    const { dialog, props } = view({ kinds: ['freezer'], selectedPlaces: [2] })
    const kinds = within(dialog).getByRole('group', { name: 'Filter by kind' })
    expect(within(kinds).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pantry', 'Fridge', 'Freezer'])
    expect(within(kinds).getByRole('button', { name: 'Freezer' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(kinds).getByRole('button', { name: 'Fridge' }))
    expect(props.onKind).toHaveBeenCalledWith('fridge')
    expect(within(dialog).getByRole('option', { name: /Garage Freezer/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(within(dialog).getByRole('option', { name: /Not sorted/ }))
    expect(props.onPlace).toHaveBeenCalledWith(0)
  })
  it('the switch turns grouping off', async () => {
    const { dialog, props } = view()
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Group by Storage Place' }))
    expect(props.onGroupByPlace).toHaveBeenCalledWith(false)
  })
  it('By Ingredient: only Use soon and Spoiled', () => {
    const { dialog } = view({ mode: 'ingredients' })
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Show'])
    expect(within(within(dialog).getByRole('group', { name: 'Show' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Use soon', 'Spoiled'])
    expect(within(dialog).queryByRole('switch')).toBeNull()
  })
  it('a Household with no Storage Places has no Kind and no Storage Place section', () => {
    const { dialog } = view({ places: [] })
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Show'])
    expect(within(dialog).getByRole('switch', { name: 'Group by Storage Place' })).toBeInTheDocument()
  })
  it('never says "Done"; Show Stock closes it', async () => {
    const { dialog, props } = view()
    expect(within(dialog).queryByRole('button', { name: 'Done' })).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show Stock' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})
