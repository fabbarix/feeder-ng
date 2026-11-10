import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotRulesEditor, VarietyRulesEditor } from './RulesEditors'

const mealSlots = [{ id: 5, weekday: 5, name: 'Dinner', time: '19:00' }, { id: 6, weekday: 6, name: 'Lunch', time: '12:30' }]
const recipes = [{ id: 3, name: 'Curry', tags: [] }, { id: 4, name: 'Pizza', tags: ['pizza'] }]
const tags = [{ name: 'fish', recipes: 2 }, { name: 'pizza', recipes: 1 }]

/** Picks an option of one of our Select primitives: open its combobox, click the option. */
async function pick(field: string, option: string | RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: field }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('RulesEditors use no native controls', () => {
  it('has no <select>, no text/number/checkbox <input> of its own (the primitives own those)', () => {
    const { container } = render(
      <>
        <SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={() => {}} onRemove={() => {}} error={null} />
        <VarietyRulesEditor rules={[]} tags={tags} onSave={() => {}} onRemove={() => {}} error={null} />
      </>,
    )
    expect(container.querySelector('select')).toBeNull()
    expect(container.querySelector('input[type="number"]')).toBeNull()
  })
})

describe('SlotRulesEditor', () => {
  it('lists the rules with their Meal Slot and removes one', async () => {
    const onRemove = vi.fn()
    render(
      <SlotRulesEditor rules={[{ id: 9, mealSlotId: 5, tag: 'pizza' }]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={() => {}} onRemove={onRemove} error={null} />,
    )
    const list = within(screen.getByRole('list', { name: 'Slot Rules' }))
    expect(list.getByText('Friday Dinner')).toBeInTheDocument()
    expect(list.getByText('Tag: pizza')).toBeInTheDocument()
    await userEvent.click(list.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(9)
  })

  it('says so when there are no rules', () => {
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={() => {}} onRemove={() => {}} error={null} />)
    expect(screen.getByText('No Slot Rules.')).toBeInTheDocument()
  })

  it('adds a rule fixing a Meal Slot to a Tag picked from the existing Tags', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={onAdd} onRemove={() => {}} error={null} />)
    await pick('Meal Slot', /Dinner/)
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    await pick('Tag', /pizza/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, tag: 'pizza' })
  })

  it('the Tag cannot be typed: there is no text field for it', async () => {
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={() => {}} onRemove={() => {}} error={null} />)
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    expect(screen.getByRole('combobox', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Tag' })).not.toBeInTheDocument()
  })

  it('adds a rule fixing a Meal Slot to a Recipe (the default kind)', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={onAdd} onRemove={() => {}} error={null} />)
    expect(screen.getByRole('radio', { name: 'a Recipe' })).toBeChecked()
    await pick('Meal Slot', /Lunch/)
    await pick('Recipe', /Curry/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 6, recipeId: 3 })
  })

  it('asks for a Tag before adding', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={onAdd} onRemove={() => {}} error={null} />)
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a Tag.')
  })

  it('shows a server error', () => {
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={recipes} tags={tags} onAdd={() => {}} onRemove={() => {}} error="That Slot Rule already exists." />)
    expect(screen.getByRole('alert')).toHaveTextContent('That Slot Rule already exists.')
  })
})

describe('VarietyRulesEditor', () => {
  it('lists the rules in words and removes one', async () => {
    const onRemove = vi.fn()
    render(<VarietyRulesEditor rules={[{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: true }]} tags={tags} onSave={() => {}} onRemove={onRemove} error={null} />)
    const list = within(screen.getByRole('list', { name: 'Variety Rules' }))
    expect(list.getByText('fish')).toBeInTheDocument()
    expect(list.getByText('At most 2 a week, not on consecutive days')).toBeInTheDocument()
    await userEvent.click(list.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith('fish')
  })

  it('the Tag is a Select fed by the existing Tags, each with its Recipe count', async () => {
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={() => {}} onRemove={() => {}} error={null} />)
    expect(screen.queryByRole('textbox', { name: 'Tag' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['fish2 Recipes', 'pizza1 Recipe'])
  })

  it('saves a rule from the form: Tag picked, weekly limit in a number field, a real checkbox', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={onSave} onRemove={() => {}} error={null} />)
    await pick('Tag', /fish/)
    const max = screen.getByRole('spinbutton', { name: 'At most per week' })
    await userEvent.clear(max)
    await userEvent.type(max, '2{Enter}')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Not on consecutive days' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).toHaveBeenCalledWith({ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: true })
  })

  // R11a N5: the weekly limit starts at its minimum (1), not blank/0. Clearing it still means "no cap".
  it('"At most per week" starts at 1, and is back at 1 after a rule is saved', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={onSave} onRemove={() => {}} error={null} />)
    const max = screen.getByRole('spinbutton', { name: 'At most per week' })
    expect(max).toHaveValue('1')
    await pick('Tag', /fish/)
    await userEvent.clear(max)
    await userEvent.type(max, '3{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).toHaveBeenCalledWith({ tag: 'fish', maxPerWeek: 3, notConsecutiveDays: false })
    expect(screen.getByRole('spinbutton', { name: 'At most per week' })).toHaveValue('1')
  })

  it('saves a default rule with a limit of 1', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={onSave} onRemove={() => {}} error={null} />)
    await pick('Tag', /fish/)
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).toHaveBeenCalledWith({ tag: 'fish', maxPerWeek: 1, notConsecutiveDays: false })
  })

  it('names the first problem and saves nothing', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={onSave} onRemove={() => {}} error={null} />)
    await pick('Tag', /fish/)
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'At most per week' })) // empty = no cap
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a weekly limit or not on consecutive days.')
  })

  it('asks for a Tag first', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={onSave} onRemove={() => {}} error={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a Tag.')
  })

  it('with no Tags yet it says where they come from', () => {
    render(<VarietyRulesEditor rules={[]} tags={[]} onSave={() => {}} onRemove={() => {}} error={null} />)
    expect(screen.getByText('Add Tags to your Recipes to use them here.')).toBeInTheDocument()
  })
})
