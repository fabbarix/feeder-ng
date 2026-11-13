// Supplies in the Pantry (household-items.md 4.6, 6; H6): the "Food or Supplies" section of the Filters panel. It is its own
// section, apart from "Kind" (the Storage Place kind).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import { PantryFiltersPanel, type PantryFiltersPanelProps } from './PantryFiltersPanel'

const places: StoragePlace[] = [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }]

function view(over: Partial<PantryFiltersPanelProps> = {}) {
  const props: PantryFiltersPanelProps = {
    open: true, onClose: vi.fn(), anchorRef: createRef<HTMLElement>(), mode: 'places', status: 'all', onStatus: vi.fn(),
    hasLeftovers: false, leftovers: false, onLeftovers: vi.fn(), kinds: [], onKind: vi.fn(), places, lots: [makeLot({ id: 1, storagePlaceId: 2 })],
    selectedPlaces: [], onPlace: vi.fn(), groupByPlace: true, onGroupByPlace: vi.fn(), count: 0, onClear: vi.fn(),
    stock: 'all', onStock: vi.fn(), hasSupplies: true, ...over,
  }
  render(<PantryFiltersPanel {...props} />)
  return { props, dialog: screen.getByRole('dialog', { name: 'Filters' }) }
}
const headings = (dialog: HTMLElement) => within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

afterEach(() => vi.unstubAllGlobals())

describe.each([390, 1024])('PantryFiltersPanel with Supplies at %i px', (width) => {
  it('has a "Food or Supplies" section with the chips Food and Supplies, after Show and before Kind', () => {
    stubViewportWidth(width)
    const { dialog } = view()
    expect(headings(dialog)).toEqual(['Show', 'Food or Supplies', 'Kind', 'Storage Place'])
    const group = within(dialog).getByRole('group', { name: 'Food or Supplies' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Food', 'Supplies'])
  })
})

describe('the Food or Supplies section', () => {
  it('is a section of its own: Kind keeps the Storage Place kinds and gains nothing', () => {
    const { dialog } = view()
    const kinds = within(dialog).getByRole('group', { name: 'Filter by kind' })
    expect(within(kinds).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pantry', 'Fridge', 'Freezer'])
  })
  it('shows only while the Household has a Supply', () => {
    const { dialog } = view({ hasSupplies: false })
    expect(headings(dialog)).toEqual(['Show', 'Kind', 'Storage Place'])
    expect(within(dialog).queryByRole('group', { name: 'Food or Supplies' })).toBeNull()
  })
  it('has no "All": nothing pressed means both', () => {
    const { dialog } = view()
    const group = within(dialog).getByRole('group', { name: 'Food or Supplies' })
    expect(within(group).queryByRole('button', { name: 'All' })).toBeNull()
    for (const b of within(group).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
  })
  it('presses the value in force', () => {
    const { dialog } = view({ stock: 'supply', count: 1 })
    const group = within(dialog).getByRole('group', { name: 'Food or Supplies' })
    expect(within(group).getByRole('button', { name: 'Supplies' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('hands each press on', async () => {
    const { dialog, props } = view({ stock: 'food', count: 1 })
    const group = within(dialog).getByRole('group', { name: 'Food or Supplies' })
    await userEvent.click(within(group).getByRole('button', { name: 'Supplies' }))
    expect(props.onStock).toHaveBeenCalledWith('supply')
    await userEvent.click(within(group).getByRole('button', { name: 'Food' }))
    expect(props.onStock).toHaveBeenCalledWith('food')
  })
  it('is on By Ingredient too, with Show; the Storage Place sections are not', () => {
    const { dialog } = view({ mode: 'ingredients' })
    expect(headings(dialog)).toEqual(['Show', 'Food or Supplies'])
  })
  it('keeps the section when the Household has no Storage Places', () => {
    const { dialog } = view({ places: [] })
    expect(headings(dialog)).toEqual(['Show', 'Food or Supplies'])
  })
})
