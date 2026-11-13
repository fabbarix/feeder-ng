// hf-recipes-filter: the Filters panel: Course and Tag, Clear filters and Close (docs/design/recipes-filter.md 4, 5, 8, 9).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { courseChoices } from '../fixtures.test-helper'
import { RecipeFiltersPanel, type RecipeFiltersPanelProps } from './RecipeFiltersPanel'

const known = Array.from({ length: 26 }, (_, i) => ({ name: `Tag ${i + 1}`, recipes: 1 })).concat([{ name: 'fish', recipes: 3 }])

function panel(over: Partial<RecipeFiltersPanelProps> = {}) {
  const anchor = createRef<HTMLButtonElement>()
  const props: RecipeFiltersPanelProps = {
    open: true,
    onClose: vi.fn(),
    anchorRef: anchor,
    bases: false,
    courses: courseChoices,
    course: null,
    onCourse: vi.fn(),
    known,
    tag: '',
    colourOf: () => undefined,
    onTag: vi.fn(),
    count: 0,
    onClear: vi.fn(),
    ...over,
  }
  render(
    <>
      <button ref={anchor}>Filters</button>
      <RecipeFiltersPanel {...props} />
    </>,
  )
  return props
}

afterEach(() => vi.unstubAllGlobals())

describe('RecipeFiltersPanel', () => {
  it('is a dialog titled "Filters" with a Course and a Tag section', () => {
    panel()
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByText('Course')).toBeInTheDocument()
    expect(within(dialog).getByText('Tag')).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Filter by Course' })).toBeInTheDocument()
    expect(within(dialog).getByRole('listbox', { name: 'Filter by Tag' })).toBeInTheDocument()
  })
  it('renders nothing while closed', () => {
    panel({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('the Course chips: All Courses first, then each Course; one picks it', async () => {
    const props = panel({ course: 2 })
    const group = screen.getByRole('group', { name: 'Filter by Course' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All Courses', 'Main', 'Side', 'Starter', 'Dessert'])
    expect(within(group).getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(group).getByRole('button', { name: 'Dessert' }))
    expect(props.onCourse).toHaveBeenCalledWith(4)
    await userEvent.click(within(group).getByRole('button', { name: 'All Courses' }))
    expect(props.onCourse).toHaveBeenCalledWith(null)
  })
  it('has no Course section on Base recipes', () => {
    panel({ bases: true })
    expect(screen.queryByRole('group', { name: 'Filter by Course' })).toBeNull()
    expect(screen.queryByText('Course')).toBeNull()
    expect(screen.getByRole('listbox', { name: 'Filter by Tag' })).toBeInTheDocument()
  })
  it('finds a Tag among many and chooses it', async () => {
    const props = panel()
    expect(screen.getAllByRole('option')).toHaveLength(27)
    await userEvent.type(screen.getByRole('combobox', { name: 'Search Tags' }), 'fis')
    await userEvent.click(screen.getByRole('option', { name: 'fish' }))
    expect(props.onTag).toHaveBeenCalledWith('fish')
  })
  it('Clear filters is disabled while no filter is on', () => {
    panel()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })
  it('Clear filters calls onClear', async () => {
    const props = panel({ count: 2, course: 1, tag: 'fish' })
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(props.onClear).toHaveBeenCalledTimes(1)
    expect(props.onClose).not.toHaveBeenCalled()
  })
  it('Close (the footer button) closes the panel', async () => {
    const props = panel()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
  it('has no accent button (New Recipe stays the one primary action)', () => {
    panel({ count: 1, tag: 'fish' })
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog.querySelector('button[data-variant="primary"]')).toBeNull()
  })
  it('opens on the first Course chip', () => {
    panel()
    expect(screen.getByRole('button', { name: 'All Courses' })).toHaveFocus()
  })
  it('opens on the Tag search on Base recipes', () => {
    panel({ bases: true })
    expect(screen.getByRole('combobox', { name: 'Search Tags' })).toHaveFocus()
  })
  it('is a bottom sheet on a phone', () => {
    stubViewportWidth(390)
    panel()
    expect(screen.getByRole('dialog', { name: 'Filters' }).tagName).toBe('DIALOG')
  })
  it('is a popover anchored to the button from 768 px', () => {
    stubViewportWidth(834)
    panel()
    expect(screen.getByRole('dialog', { name: 'Filters' }).tagName).not.toBe('DIALOG')
  })
})
