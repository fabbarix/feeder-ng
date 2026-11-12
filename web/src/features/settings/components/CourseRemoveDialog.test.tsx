// CourseRemoveDialog (CRS D2): the Delete / Archive dialog, a `<dialog>` with the impact, the replacement and the lists.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CourseRemovalState } from '../hooks/useCourseRemoval'
import { pickOption } from '../test-utils'
import { choices, emptyImpact, sideCourse, sideImpact } from './courseFixtures'
import { CourseRemoveDialog } from './CourseRemoveDialog'

function state(over: Partial<CourseRemovalState> = {}): CourseRemovalState {
  return {
    course: sideCourse,
    mode: 'delete',
    impact: sideImpact,
    loading: false,
    loadFailed: false,
    choices: choices.filter((c) => c.id !== 2),
    replacementId: 1,
    setReplacementId: vi.fn(),
    needsReplacement: true,
    busy: false,
    error: undefined,
    open: vi.fn(),
    close: vi.fn(),
    confirm: vi.fn(async () => {}),
    ...over,
  }
}
const show = (s: CourseRemovalState) => render(<CourseRemoveDialog state={s} locale="en" />)
const dialog = (name: string) => screen.getByRole('dialog', { name })

describe('CourseRemoveDialog: Delete', () => {
  it('renders nothing while closed', () => {
    show(state({ course: null }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a <dialog> named "Delete Side?" that says what the Course is on', () => {
    show(state())
    const d = dialog('Delete Side?')
    expect(d.tagName).toBe('DIALOG')
    expect(within(d).getByText('Side is on 8 Recipes and 3 Meal Slots.')).toBeInTheDocument()
  })

  it('asks for a replacement Course with the sentence that names who needs it, defaulting to Main', () => {
    show(state())
    const d = dialog('Delete Side?')
    expect(within(d).getByText('3 Recipes and 2 Meal Slots have only Side: give them Main')).toBeInTheDocument()
    expect(within(d).getByRole('combobox', { name: 'Replacement Course' })).toHaveTextContent('Main')
  })

  it('choosing another replacement reports it and the sentence follows', async () => {
    const setReplacementId = vi.fn()
    show(state({ setReplacementId }))
    await pickOption('Replacement Course', 'Dessert', within(dialog('Delete Side?')))
    expect(setReplacementId).toHaveBeenCalledWith(4)
  })

  it('does not offer the Course itself as its replacement', async () => {
    show(state())
    await userEvent.click(screen.getByRole('combobox', { name: 'Replacement Course' }))
    expect(screen.queryByRole('option', { name: /^Side/ })).toBeNull()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Main'), expect.stringContaining('Dessert')]))
  })

  it('lists the Planned Meals that go with the Pinned ones first, marked in words, then the Slot Rules', () => {
    show(state())
    const d = dialog('Delete Side?')
    const meals = within(within(d).getByRole('list', { name: 'Planned Meals that go, from today on' })).getAllByRole('listitem')
    expect(meals).toHaveLength(2)
    expect(meals[0]).toHaveTextContent('Roast potatoes · Dinner · Thu 12 Nov')
    expect(meals[1]).toHaveTextContent('Green salad · Dinner · Tue 10 Nov')
    expect(meals[0]).toHaveTextContent('Pinned')
    expect(meals[1]).not.toHaveTextContent('Pinned')
    const rules = within(within(d).getByRole('list', { name: 'Slot Rules that go' })).getAllByRole('listitem')
    expect(rules.map((r) => r.textContent)).toEqual(['Roast potatoes', 'Tag vegetarian'])
  })

  it('has no replacement and no lists when nothing uses the Course', () => {
    show(state({ impact: emptyImpact, needsReplacement: false }))
    const d = dialog('Delete Side?')
    expect(within(d).getByText('Side is not on any Recipe or Meal Slot.')).toBeInTheDocument()
    expect(within(d).queryByRole('combobox')).toBeNull()
    expect(within(d).queryByRole('list')).toBeNull()
  })

  it('Cancel is focused first; Delete Course confirms; Cancel and Escape close', async () => {
    const s = state()
    show(s)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Course' }))
    expect(s.confirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(s.close).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(s.close).toHaveBeenCalledTimes(2)
  })

  it('while the impact loads it says so and cannot be confirmed', () => {
    show(state({ impact: undefined, loading: true }))
    expect(screen.getByRole('status')).toHaveTextContent('Checking what uses Side')
    expect(screen.getByRole('button', { name: 'Delete Course' })).toBeDisabled()
  })

  it('when the impact cannot be loaded it says so and cannot be confirmed', () => {
    show(state({ impact: undefined, loadFailed: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not check what uses this Course.')
    expect(screen.getByRole('button', { name: 'Delete Course' })).toBeDisabled()
  })

  it('shows a refusal as an alert and disables the buttons while busy', () => {
    show(state({ error: 'Make another Course main first.', busy: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('Make another Course main first.')
    expect(screen.getByRole('button', { name: 'Delete Course' })).toBeDisabled()
  })
})

describe('CourseRemoveDialog: Archive', () => {
  it('turns into "Archive Side?" with the reason and the same replacement and lists', () => {
    show(state({ mode: 'archive' }))
    const d = dialog('Archive Side?')
    expect(within(d).getByText(/has been used in the plan, so it cannot be deleted/)).toBeInTheDocument()
    expect(within(d).getByRole('combobox', { name: 'Replacement Course' })).toBeInTheDocument()
    expect(within(d).getByRole('list', { name: 'Slot Rules that go' })).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: 'Delete Course' })).toBeNull()
  })

  it('Archive Course confirms', async () => {
    const s = state({ mode: 'archive' })
    show(s)
    await userEvent.click(screen.getByRole('button', { name: 'Archive Course' }))
    expect(s.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('CourseRemoveDialog: no native UI', () => {
  it('has no <select>, no window.confirm and no native input', () => {
    const confirm = vi.spyOn(window, 'confirm')
    show(state())
    expect(document.querySelector('select, input')).toBeNull()
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('CourseRemoveDialog: the planned-refusal sentence is announced', () => {
  it('in Archive mode it is a role="status" sentence', () => {
    show(state({ mode: 'archive' }))
    expect(screen.getAllByRole('status').some((n) => /cannot be deleted/.test(n.textContent ?? ''))).toBe(true)
  })
})
