// B9-15 (DS-03, decision DS 6): FilterBarViewRow is the view row of both filter headers: the view control at the start, the Sort chip at the
// end. It asks useSortFits whether the Sort fits and passes `iconOnly={!fits}` to the Sort it renders; no logic of its own. A hidden, inert
// copy of the Sort with its value shown is what useSortFits measures.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Select } from '../Select/Select'

const state = { fits: true }
vi.mock('./useSortFits', async (orig) => ({ ...(await orig<typeof import('./useSortFits')>()), useSortFits: () => ({ fits: state.fits }) }))
const { FilterBarViewRow } = await import('./FilterBar')

const sorts = [
  { value: 'use', label: 'Good until' },
  { value: 'name', label: 'Name' },
]
const sortSelect = ({ iconOnly }: { iconOnly: boolean }) => (
  <Select label="Sort" appearance="chip" icon="sort" iconOnly={iconOnly} options={sorts} value="use" onChange={() => {}} />
)
const view = <div role="radiogroup" aria-label="View" />

beforeEach(() => {
  state.fits = true
})

describe('FilterBarViewRow', () => {
  it('with room, Sort is named "Sort" and shows its value', () => {
    render(<FilterBarViewRow view={view} sort={sortSelect} />)
    const sort = screen.getByRole('combobox', { name: 'Sort' })
    expect(sort).toHaveTextContent('Good until')
    expect(sort).not.toHaveAttribute('data-icon-only')
  })
  it('with no room, Sort is named "Sort: Good until" and is icon-only, still a combobox', () => {
    state.fits = false
    render(<FilterBarViewRow view={view} sort={sortSelect} />)
    const sort = screen.getByRole('combobox', { name: 'Sort: Good until' })
    expect(sort).toHaveAttribute('data-icon-only', 'true')
    expect(sort.querySelector('.select__value')).toHaveClass('visually-hidden')
  })
  it('the row keeps the markup the stylesheet and the guard read: one view row, the view first, the Sort in .filter-bar__sort', () => {
    const { container } = render(<FilterBarViewRow view={view} sort={sortSelect} />)
    const row = container.querySelector('.filter-bar__row.filter-bar__view-row')!
    expect(row.firstElementChild).toBe(screen.getByRole('radiogroup', { name: 'View' }))
    expect(row.querySelector(':scope > .filter-bar__sort')).toContainElement(screen.getByRole('combobox', { name: 'Sort' }))
  })
  it('a hidden, inert copy of the Sort with its value shown is what is measured; it is not in the accessibility tree', () => {
    state.fits = false
    const { container } = render(<FilterBarViewRow view={view} sort={sortSelect} />)
    const copy = container.querySelector('.filter-bar__sort-measure')!
    expect(copy).toHaveAttribute('aria-hidden', 'true')
    expect(copy).toHaveAttribute('inert')
    expect(copy.querySelector('.select__trigger')).not.toHaveAttribute('data-icon-only')
    expect(copy).toHaveTextContent('Good until')
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })
  it('without a Sort (a view that has none) the row is the view alone', () => {
    const { container } = render(<FilterBarViewRow view={view} />)
    expect(container.querySelector('.filter-bar__sort')).toBeNull()
    expect(container.querySelector('.filter-bar__sort-measure')).toBeNull()
  })
})
