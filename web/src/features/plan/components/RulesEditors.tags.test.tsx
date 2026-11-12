// TG-PW: Tag colours in the Slot Rule and Variety Rule editors: dots in the pickers, pills in the rows, a neutral pill for a Tag that is gone.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotRulesEditor, VarietyRulesEditor } from './RulesEditors'

const mealSlots = [{ id: 5, weekday: 5, name: 'Dinner', time: '19:00' }]
const tags = [
  { id: 1, name: 'Fish', key: 'fish', colour: 'teal', recipes: 2, slotRules: 0, varietyRule: false },
  { id: 2, name: 'Fish Pie', key: 'fish pie', colour: 'plum', recipes: 1, slotRules: 0, varietyRule: false },
]
const noop = () => {}

describe('Slot Rule rows', () => {
  it('a Tag rule shows a Tag pill with the Tag name (not the key) in the Tag colour', () => {
    render(<SlotRulesEditor rules={[{ id: 9, mealSlotId: 5, tag: 'fish pie' }]} mealSlots={mealSlots} recipes={[]} tags={tags} onAdd={noop} onRemove={noop} error={null} />)
    const pill = within(screen.getByRole('list', { name: 'Slot Rules' })).getByText('Fish Pie').closest('.chip')
    expect(pill).toHaveAttribute('data-kind', 'tag')
    expect(pill).toHaveAttribute('data-tag-colour', 'plum')
  })

  it('a rule on a Tag that is gone shows its key in a neutral pill', () => {
    render(<SlotRulesEditor rules={[{ id: 9, mealSlotId: 5, tag: 'soup' }]} mealSlots={mealSlots} recipes={[]} tags={tags} onAdd={noop} onRemove={noop} error={null} />)
    const pill = within(screen.getByRole('list', { name: 'Slot Rules' })).getByText('soup').closest('.chip')
    expect(pill).not.toBeNull()
    expect(pill).not.toHaveAttribute('data-tag-colour')
  })

  it('a Recipe rule has no Tag pill', () => {
    render(<SlotRulesEditor rules={[{ id: 9, mealSlotId: 5, recipeId: 3, recipeName: 'Curry' }]} mealSlots={mealSlots} recipes={[]} tags={tags} onAdd={noop} onRemove={noop} error={null} />)
    expect(within(screen.getByRole('list', { name: 'Slot Rules' })).getByText('Recipe: Curry')).toBeInTheDocument()
    expect(document.querySelector('[data-kind="tag"]')).toBeNull()
  })
})

describe('Tag pickers', () => {
  it('the Slot Rule Tag select shows a colour dot on each Tag', async () => {
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={[]} tags={tags} onAdd={noop} onRemove={noop} error={null} />)
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Fish2 Recipes', 'Fish Pie1 Recipe'])
    for (const o of options) expect(o.querySelector('[data-tag-colour]')).not.toBeNull()
  })

  it('picking a Tag adds the rule with the Tag key, not its name', async () => {
    const onAdd = vi.fn()
    render(<SlotRulesEditor rules={[]} mealSlots={mealSlots} recipes={[]} tags={tags} onAdd={onAdd} onRemove={noop} error={null} />)
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
    await userEvent.click(await screen.findByRole('option', { name: /Fish Pie/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, tag: 'fish pie' })
  })
})

describe('Variety Rule rows and picker', () => {
  it('the row shows the Tag pill by name, in the Tag colour', () => {
    render(<VarietyRulesEditor rules={[{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false }]} tags={tags} onSave={noop} onRemove={noop} error={null} />)
    const pill = within(screen.getByRole('list', { name: 'Variety Rules' })).getByText('Fish').closest('.chip')
    expect(pill).toHaveAttribute('data-tag-colour', 'teal')
  })

  it('a rule on a Tag that is gone shows its key in a neutral pill', () => {
    render(<VarietyRulesEditor rules={[{ tag: 'soup', maxPerWeek: 1, notConsecutiveDays: false }]} tags={tags} onSave={noop} onRemove={noop} error={null} />)
    const pill = within(screen.getByRole('list', { name: 'Variety Rules' })).getByText('soup').closest('.chip')
    expect(pill).not.toHaveAttribute('data-tag-colour')
  })

  it('the Tag select shows colour dots and saves the Tag key', async () => {
    const onSave = vi.fn()
    render(<VarietyRulesEditor rules={[]} tags={tags} onSave={onSave} onRemove={noop} error={null} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
    for (const o of screen.getAllByRole('option')) expect(o.querySelector('[data-tag-colour]')).not.toBeNull()
    await userEvent.click(await screen.findByRole('option', { name: /Fish Pie/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(onSave).toHaveBeenCalledWith({ tag: 'fish pie', maxPerWeek: 1, notConsecutiveDays: false })
  })
})
