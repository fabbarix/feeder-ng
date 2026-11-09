import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotRulesEditor, VarietyRulesEditor } from './RulesEditors'

const mealSlots = [{ id: 5, weekday: 5, name: 'Dinner' }, { id: 6, weekday: 6, name: 'Lunch' }]
const recipes = [{ id: 3, name: 'Curry' }, { id: 4, name: 'Pizza' }]

describe('SlotRulesEditor', () => {
  it('lists the rules with their Meal Slot and removes one', async () => {
    const onRemove = vi.fn()
    render(
      <SlotRulesEditor rules={[{ id: 9, mealSlotId: 5, tag: 'pizza' }]} mealSlots={mealSlots} recipes={recipes} onAdd={() => {}} onRemove={onRemove} error={null} />,
    )
    const list = within(screen.getByRole('list', { name: 'Slot Rules' }))
    expect(list.getByText('Friday Dinner')).toBeInTheDocument()
    expect(list.getByText('Tag: pizza')).toBeInTheDocument()
    await userEvent.click(list.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(9)
  })

  it('says so when there are no rules', () => {
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} onAdd={() => {}} onRemove={() => {}} error={null} />)
    expect(screen.getByText('No Slot Rules.')).toBeInTheDocument()
  })

  it('adds a rule fixing a Meal Slot to a Tag', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} onAdd={onAdd} onRemove={() => {}} error={null} />)
    await userEvent.selectOptions(screen.getByLabelText('Meal Slot'), 'Friday Dinner')
    await userEvent.selectOptions(screen.getByLabelText('Fixed to'), 'a Tag')
    await userEvent.type(screen.getByLabelText('Tag'), ' Pizza ')
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, tag: 'Pizza' })
  })

  it('adds a rule fixing a Meal Slot to a Recipe', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} onAdd={onAdd} onRemove={() => {}} error={null} />)
    await userEvent.selectOptions(screen.getByLabelText('Meal Slot'), 'Saturday Lunch')
    await userEvent.selectOptions(screen.getByLabelText('Recipe'), 'Curry')
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 6, recipeId: 3 })
  })

  it('asks for a Tag or Recipe before adding', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} onAdd={onAdd} onRemove={() => {}} error={null} />)
    await userEvent.selectOptions(screen.getByLabelText('Fixed to'), 'a Tag')
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Tag.')
  })

  it('shows a server error', () => {
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} onAdd={() => {}} onRemove={() => {}} error="That Slot Rule already exists." />)
    expect(screen.getByRole('alert')).toHaveTextContent('That Slot Rule already exists.')
  })
})

describe('VarietyRulesEditor', () => {
  it('lists the rules in words and removes one', async () => {
    const onRemove = vi.fn()
    render(<VarietyRulesEditor rules={[{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: true }]} onSave={() => {}} onRemove={onRemove} error={null} />)
    const list = within(screen.getByRole('list', { name: 'Variety Rules' }))
    expect(list.getByText('fish')).toBeInTheDocument()
    expect(list.getByText('At most 2 a week, never on consecutive days')).toBeInTheDocument()
    await userEvent.click(list.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith('fish')
  })

  it('saves a rule from the form', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} onSave={onSave} onRemove={() => {}} error={null} />)
    await userEvent.type(screen.getByLabelText('Tag'), 'Fish')
    await userEvent.type(screen.getByLabelText('At most per week'), '2')
    await userEvent.click(screen.getByLabelText('Never on consecutive days'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).toHaveBeenCalledWith({ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: true })
  })

  it('names the first problem and saves nothing', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} onSave={onSave} onRemove={() => {}} error={null} />)
    await userEvent.type(screen.getByLabelText('Tag'), 'fish')
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a weekly limit or never on consecutive days.')
  })
})
