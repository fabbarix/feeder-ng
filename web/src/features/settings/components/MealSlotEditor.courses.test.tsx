// CRS D2: the Courses field of the Meal Slot editor (adding, editing, the multi-day batch, the removal preview).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SlotBatchRequest, SlotBatchResult, SlotRemoves } from '../types'
import { choices, thursdayDinnerCourses, tuesdayDinnerCourses } from './courseFixtures'
import { members } from './fixtures'
import { MealSlotEditor, type MealSlotEditorProps } from './MealSlotEditor'

const slots = [tuesdayDinnerCourses, thursdayDinnerCourses]
const rowNames = () => within(screen.getByRole('list', { name: 'Courses in order' })).getAllByTestId('course-name').map((n) => n.textContent)
const row = (name: string) => within(screen.getByRole('list', { name: 'Courses in order' })).getAllByRole('listitem').find((r) => within(r).queryByTestId('course-name')?.textContent === name)!
const summary = () => within(screen.getByRole('list', { name: 'What will change' }))
const day = (name: string) => screen.getByRole('button', { name })

function add(over: Partial<MealSlotEditorProps> = {}) {
  const onSave = vi.fn()
  render(<MealSlotEditor open members={members} defaultWeekdays={[2]} courses={choices} onSave={onSave} onClose={() => {}} {...over} />)
  return { onSave }
}
function edit(over: Partial<MealSlotEditorProps> = {}) {
  const onApply = vi.fn()
  const onSave = vi.fn()
  render(<MealSlotEditor open members={members} slot={tuesdayDinnerCourses} slots={slots} courses={choices} onSave={onSave} onApply={onApply} onClose={() => {}} {...over} />)
  return { onApply, onSave }
}
async function fillNewSlot() {
  await userEvent.type(screen.getByLabelText('Name'), 'Dinner')
  screen.getByRole('spinbutton', { name: 'Hour' }).focus()
  await userEvent.keyboard('1930')
}

describe('MealSlotEditor Courses: adding', () => {
  it('has no Courses field without the household Courses (the old editor)', () => {
    add({ courses: undefined })
    expect(screen.queryByRole('group', { name: 'Courses' })).toBeNull()
  })

  it('starts with the main Course alone, required, with every attending Member eating it', () => {
    add()
    expect(rowNames()).toEqual(['Main'])
    expect(within(row('Main')).getByRole('switch', { name: 'Optional: Main' })).toHaveAttribute('aria-checked', 'false')
    expect(within(row('Main')).getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Anna', 'Marco', 'Sam'])
  })

  it('saves the chosen Courses in order with Optional and opt-outs on every chosen weekday', async () => {
    const { onSave } = add()
    await userEvent.click(day('Thursday'))
    await fillNewSlot()
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dessert' }))
    await userEvent.click(within(row('Dessert')).getByRole('switch', { name: 'Optional: Dessert' }))
    await userEvent.click(within(within(row('Dessert')).getByRole('group', { name: 'Who eats Dessert' })).getByRole('button', { name: 'Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    const courses = [
      { id: 1, optional: false, optOutMemberIds: [] },
      { id: 2, optional: false, optOutMemberIds: [] },
      { id: 4, optional: true, optOutMemberIds: [3] },
    ]
    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ weekday: 2, courses }), expect.objectContaining({ weekday: 4, courses })])
  })

  it('refuses to save with no Course, saying "Choose at least one Course"', async () => {
    const { onSave } = add()
    await fillNewSlot()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Main' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['Choose at least one Course'])
  })

  it('refuses to save when every Course is optional, saying to keep one that is not', async () => {
    const { onSave } = add()
    await fillNewSlot()
    await userEvent.click(within(row('Main')).getByRole('switch', { name: 'Optional: Main' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Keep at least one Course that is not optional')
  })

  it('allows an optional main Course when another Course is required', async () => {
    const { onSave } = add()
    await fillNewSlot()
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await userEvent.click(within(row('Main')).getByRole('switch', { name: 'Optional: Main' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ courses: [{ id: 1, optional: true, optOutMemberIds: [] }, { id: 2, optional: false, optOutMemberIds: [] }] })])
  })

  it('offers "Who eats it" only to the Members who attend the slot', async () => {
    add()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' }))
    expect(within(within(row('Main')).getByRole('group', { name: 'Who eats Main' })).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Anna', 'Sam'])
  })
})

describe('MealSlotEditor Courses: editing', () => {
  it('opens on the slot\'s Courses in its own order, with Optional and opt-outs', () => {
    edit()
    expect(rowNames()).toEqual(['Main', 'Side', 'Dessert'])
    expect(within(row('Dessert')).getByRole('switch', { name: 'Optional: Dessert' })).toHaveAttribute('aria-checked', 'true')
    expect(within(row('Dessert')).getByRole('button', { name: 'Sam' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Dessert · without Sam')).toBeInTheDocument()
  })

  it('does not send the Courses when only another field changed', async () => {
    const { onApply } = edit()
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Supper')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).toHaveBeenCalledWith({ match: 'Dinner', weekdays: [2], set: { name: 'Supper' } })
  })

  it('sends the whole list in its new order, each Course keeping its Optional and opt-outs', async () => {
    const { onApply } = edit()
    await userEvent.click(screen.getByRole('button', { name: 'Move Dessert up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).toHaveBeenCalledWith({
      match: 'Dinner',
      weekdays: [2],
      set: { courses: [{ id: 1, optional: false, optOutMemberIds: [] }, { id: 4, optional: true, optOutMemberIds: [3] }, { id: 2, optional: false, optOutMemberIds: [] }] },
    })
  })

  it('applies the Courses to every chosen weekday through the same batch', async () => {
    const { onApply } = edit()
    await userEvent.click(day('Thursday'))
    await userEvent.click(within(row('Side')).getByRole('switch', { name: 'Optional: Side' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).toHaveBeenCalledWith({
      match: 'Dinner',
      weekdays: [2, 4],
      set: { courses: [{ id: 1, optional: false, optOutMemberIds: [] }, { id: 2, optional: true, optOutMemberIds: [] }, { id: 4, optional: true, optOutMemberIds: [3] }] },
    })
  })

  it('keeps a Member\'s opt-out when they stop attending: the Courses are not changed by that', async () => {
    const { onApply } = edit()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    expect(within(within(row('Dessert')).getByRole('group', { name: 'Who eats Dessert' })).queryByRole('button', { name: 'Sam' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    const request = onApply.mock.calls[0]![0] as SlotBatchRequest
    expect(request.set.attendance).toBeDefined()
    expect(request.set.courses).toBeUndefined()
  })

  it('refuses to save when the last required Course is made optional', async () => {
    const { onApply } = edit()
    for (const name of ['Main', 'Side']) await userEvent.click(within(row(name)).getByRole('switch', { name: `Optional: ${name}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Keep at least one Course that is not optional')
  })
})

describe('MealSlotEditor Courses: the removal preview (dry run)', () => {
  const meal = (over: Partial<SlotRemoves['plannedMeals'][number]>) => ({
    date: '2026-11-10', mealSlotId: 10, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', recipeId: 8, recipeName: 'Green salad', pinned: false, ...over,
  })
  const removes: SlotRemoves = {
    plannedMeals: [meal({ date: '2026-11-12', mealSlotId: 11, recipeId: 7, recipeName: 'Roast potatoes', pinned: true }), meal({}), meal({ date: '2026-11-17' })],
    slotRules: [{ id: 1, mealSlotId: 10, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', recipeId: 7, recipeName: 'Roast potatoes' }],
  }
  const answer = (): SlotBatchResult => ({ match: 'Dinner', updated: [], skipped: [], removes })

  it('names what taking Side off Tuesday and Thursday removes, Pinned meals listed', async () => {
    const onPreview = vi.fn().mockResolvedValue(answer())
    edit({ onPreview })
    await userEvent.click(day('Thursday'))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Side' }))
    expect(await screen.findByText('Removes Side from Tue and Thu: 3 Planned Meals and 1 Slot Rule go')).toBeInTheDocument()
    expect(onPreview).toHaveBeenLastCalledWith({
      match: 'Dinner',
      weekdays: [2, 4],
      set: { courses: [{ id: 1, optional: false, optOutMemberIds: [] }, { id: 4, optional: true, optOutMemberIds: [3] }] },
      dryRun: true,
    })
    expect(summary().getByText('Pinned Planned Meals that go')).toBeInTheDocument()
    expect(summary().getByText('Roast potatoes · Dinner · Thu 12 Nov')).toBeInTheDocument()
  })

  it('asks nothing when no Course is taken off (reorder, Optional)', async () => {
    const onPreview = vi.fn().mockResolvedValue(answer())
    edit({ onPreview })
    await userEvent.click(screen.getByRole('button', { name: 'Move Side down' }))
    await userEvent.click(within(row('Main')).getByRole('switch', { name: 'Optional: Main' }))
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('does not hold up Save, and still saves when the preview fails', async () => {
    const onPreview = vi.fn().mockRejectedValue(new Error('boom'))
    const { onApply } = edit({ onPreview })
    await userEvent.click(screen.getByRole('button', { name: 'Remove Side' }))
    await waitFor(() => expect(onPreview).toHaveBeenCalled())
    expect(await screen.findByText('Could not check what goes.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('says only where a Course goes from when nothing goes with it', async () => {
    const onPreview = vi.fn().mockResolvedValue({ match: 'Dinner', updated: [], skipped: [], removes: { plannedMeals: [], slotRules: [] } })
    edit({ onPreview })
    await userEvent.click(screen.getByRole('button', { name: 'Remove Dessert' }))
    expect(await screen.findByText('Removes Dessert from Tue.')).toBeInTheDocument()
  })
})
