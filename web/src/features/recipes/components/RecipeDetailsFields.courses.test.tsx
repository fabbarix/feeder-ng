// CRS E2: the Courses picker and the Whole meal switch in the details of the editor (keyboard and ARIA).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { emptyDraft, type RecipeDraft } from '../lib/draft'
import { RecipeDetailsFields } from './RecipeDetailsFields'

const view = (over: Partial<RecipeDraft> = {}, errors = {}) => {
  const onChange = vi.fn()
  render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'Rice', courseIds: [1], ...over }} errors={errors} courses={courseChoices} onChange={onChange} />)
  return onChange
}

describe('RecipeDetailsFields: Courses', () => {
  it('has a group named Courses of toggle chips in household order, the chosen ones pressed', () => {
    view({ courseIds: [1, 3] })
    const group = screen.getByRole('group', { name: 'Courses' })
    const chips = Array.from(group.querySelectorAll('button'))
    expect(chips.map((b) => b.textContent)).toEqual(['Main', 'Side', 'Starter', 'Dessert'])
    expect(chips.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true', 'false'])
  })
  it('is the unordered picker: no reorder or remove buttons', () => {
    view({ courseIds: [1, 2] })
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
    expect(screen.queryByRole('list', { name: /in order/ })).toBeNull()
  })
  it('sends the new ids in household order, whatever the order of picking', async () => {
    const onChange = view({ courseIds: [3] })
    await userEvent.click(screen.getByRole('button', { name: /^Side/ }))
    expect(onChange).toHaveBeenLastCalledWith({ courseIds: [2, 3] })
    await userEvent.click(screen.getByRole('button', { name: /^Main/ }))
    expect(onChange).toHaveBeenLastCalledWith({ courseIds: [1, 3] })
  })
  it('works from the keyboard', async () => {
    const onChange = view({ courseIds: [1] })
    screen.getByRole('button', { name: /^Dessert/ }).focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith({ courseIds: [1, 4] })
  })
  it('sits after the Ready Meal switch', () => {
    view()
    const ready = screen.getByRole('checkbox', { name: /Ready Meal/ })
    const group = screen.getByRole('group', { name: 'Courses' })
    expect(ready.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('says "Choose at least one Course" for an empty choice', () => {
    view({ courseIds: [] })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one Course')
  })
  it('shows the server\'s courses error on the group', () => {
    view({}, { courses: 'course_unknown' })
    expect(screen.getByText('That Course is no longer there. Choose again.')).toBeInTheDocument()
  })
})

describe('RecipeDetailsFields: Whole meal', () => {
  it('shows the Whole meal switch under Courses while the Courses include the main Course', () => {
    view({ courseIds: [1, 2], wholeMeal: true })
    const toggle = screen.getByRole('switch', { name: 'Whole meal' })
    expect(toggle).toBeChecked()
    const group = screen.getByRole('group', { name: 'Courses' })
    expect(group.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('describes it with the helper that names the main Course', () => {
    view({ courseIds: [1] })
    expect(screen.getByRole('switch', { name: 'Whole meal' })).toHaveAccessibleDescription("Planned as Main, it leaves the slot's other Courses empty")
  })
  it('names the main Course by its flag when it is not called Main', () => {
    const renamed = courseChoices.map((c) => (c.main ? { ...c, name: 'Dinner' } : c))
    render(<RecipeDetailsFields draft={{ ...emptyDraft(), courseIds: [1] }} errors={{}} courses={renamed} onChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Whole meal' })).toHaveAccessibleDescription("Planned as Dinner, it leaves the slot's other Courses empty")
  })
  it('is hidden while the Courses do not include the main Course', () => {
    view({ courseIds: [2, 3], wholeMeal: true })
    expect(screen.queryByRole('switch', { name: 'Whole meal' })).toBeNull()
  })
  it('toggles with a click and with the keyboard', async () => {
    const onChange = view({ courseIds: [1], wholeMeal: false })
    await userEvent.click(screen.getByRole('switch', { name: 'Whole meal' }))
    expect(onChange).toHaveBeenLastCalledWith({ wholeMeal: true })
    screen.getByRole('switch', { name: 'Whole meal' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(2)
  })
  it('is not a native checkbox or select', () => {
    const { container } = render(<RecipeDetailsFields draft={{ ...emptyDraft(), courseIds: [1] }} errors={{}} courses={courseChoices} onChange={vi.fn()} />)
    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Whole meal' })).toBeNull()
  })
})
