// CRS E2: the Courses picker and the Whole meal switch of the editor (keyboard and ARIA). B9-37 (RX-02): they are in the Planning
// section (was RecipeDetailsFields.courses.test.tsx); the Courses come first there.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { emptyDraft, type RecipeDraft } from '../lib/draft'
import { RecipePlanningFields } from './RecipePlanningFields'

const defaults = { cooldownDays: 7, leftoverUseByDays: 3, frozenUseByDays: 90 }

const view = (over: Partial<RecipeDraft> = {}, errors = {}) => {
  const onChange = vi.fn()
  render(<RecipePlanningFields draft={{ ...emptyDraft(), name: 'Rice', courseIds: [1], ...over }} errors={errors} courses={courseChoices} onChange={onChange} defaults={defaults} />)
  return onChange
}

describe('RecipePlanningFields: Courses', () => {
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
  it('comes first in Planning, before the Tags and the overrides (Ready Meal is the Kind control in the Recipe section now)', () => {
    view()
    const group = screen.getByRole('group', { name: 'Courses' })
    const tags = screen.getByRole('group', { name: 'Tags' })
    const cooldown = screen.getByRole('spinbutton', { name: 'Cool-down' })
    expect(group.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tags.compareDocumentPosition(cooldown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

describe('RecipePlanningFields: Whole meal', () => {
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
    render(<RecipePlanningFields draft={{ ...emptyDraft(), courseIds: [1] }} errors={{}} courses={renamed} onChange={vi.fn()} defaults={defaults} />)
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
    const { container } = render(<RecipePlanningFields draft={{ ...emptyDraft(), courseIds: [1] }} errors={{}} courses={courseChoices} onChange={vi.fn()} defaults={defaults} />)
    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Whole meal' })).toBeNull()
  })
})
