// TG-PW (crs-f gap 3, spec "Slot Rules targeting a Course"): the Course select of the Slot Rule form, and the Course in the rows.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotRulesEditor } from './RulesEditors'

const dinner = {
  id: 5,
  weekday: 5,
  name: 'Dinner',
  time: '19:00',
  courses: [
    { id: 1, name: 'Starter', main: false },
    { id: 2, name: 'Main', main: true },
  ],
}
const lunch = { id: 6, weekday: 6, name: 'Lunch', time: '12:30', courses: [{ id: 7, name: 'Main', main: true }] }
const recipes = [{ id: 3, name: 'Curry', tags: [] }]
const noop = () => {}
const view = (over: object = {}) => (
  <SlotRulesEditor rules={[]} mealSlots={[dinner, lunch]} recipes={recipes} tags={[]} onAdd={noop} onRemove={noop} error={null} {...over} />
)
const pick = async (field: string, option: string | RegExp) => {
  await userEvent.click(screen.getByRole('combobox', { name: field }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('Slot Rule form Course select', () => {
  it('shows a Course select for a slot with several Courses, on the main Course, listing only that slot Courses', async () => {
    render(view())
    const select = screen.getByRole('combobox', { name: 'Course' })
    expect(select).toHaveTextContent('Main')
    await userEvent.click(select)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Starter', 'Mainmain Course'])
  })

  it('has no Course select for a slot with one Course', async () => {
    render(view())
    await pick('Meal Slot', /Lunch/)
    expect(screen.queryByRole('combobox', { name: 'Course' })).not.toBeInTheDocument()
  })

  it('adds the rule on the picked Course', async () => {
    const onAdd = vi.fn()
    render(view({ onAdd }))
    await pick('Course', /Starter/)
    await pick('Recipe', /Curry/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, courseId: 1, recipeId: 3 })
  })

  it('adds the rule on the main Course by default', async () => {
    const onAdd = vi.fn()
    render(view({ onAdd }))
    await pick('Recipe', /Curry/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, courseId: 2, recipeId: 3 })
  })

  it('a one-Course slot adds the rule without a courseId', async () => {
    const onAdd = vi.fn()
    render(view({ onAdd }))
    await pick('Meal Slot', /Lunch/)
    await pick('Recipe', /Curry/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 6, recipeId: 3 })
  })
})

describe('Slot Rule rows and the Course', () => {
  const rules = [
    { id: 1, mealSlotId: 5, courseId: 1, recipeId: 3, recipeName: 'Curry' },
    { id: 2, mealSlotId: 5, recipeId: 3, recipeName: 'Curry' },
    { id: 3, mealSlotId: 6, courseId: 7, recipeId: 3, recipeName: 'Curry' },
  ]

  it('names the Course when the slot has several, the main Course for a rule without a courseId; nothing for a one-Course slot', () => {
    render(view({ rules }))
    const list = within(screen.getByRole('list', { name: 'Slot Rules' }))
    expect(list.getByText('Friday Dinner · Starter')).toBeInTheDocument()
    expect(list.getByText('Friday Dinner · Main')).toBeInTheDocument()
    expect(list.getByText('Saturday Lunch')).toBeInTheDocument()
  })
})
