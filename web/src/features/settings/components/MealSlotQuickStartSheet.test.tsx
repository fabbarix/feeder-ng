// B9-53 (TB-06, step 3): the sheet "When do you eat?" over Today. R-B's circular Close, no Cancel. Toggle rows (role checkbox) for Breakfast 07:30, Lunch
// 13:00 and Dinner 19:30, each with an outlined time button, Lunch and Dinner on by default; a secondary "Add another Meal Slot"; "At the table: <Members>";
// footer "Set up by hand" (secondary) and "Create <n> Meal Slots" (primary). Create sends one batch, every weekday, in time order (the server makes everyone attend).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, marco, sam } from './fixtures'
import { MealSlotQuickStartSheet } from './MealSlotQuickStartSheet'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]
function open(over: Record<string, unknown> = {}) {
  const h = { onCreate: vi.fn(async () => {}), onSetUpByHand: vi.fn(), onClose: vi.fn() }
  render(<MealSlotQuickStartSheet open members={[anna, marco, sam]} {...h} {...over} />)
  return h
}
const dialog = () => screen.getByRole('dialog', { name: 'When do you eat?' })
const footer = () => dialog().querySelector('.sheet__footer') as HTMLElement
const row = (name: string) => within(dialog()).getByRole('checkbox', { name: new RegExp(`^${name}`) })

describe('MealSlotQuickStartSheet: the sheet', () => {
  it('is named "When do you eat?", has the circular Close and no Cancel', () => {
    open()
    expect(within(dialog()).getByRole('button', { name: /^Close/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('offers Breakfast 07:30, Lunch 13:00 and Dinner 19:30 as checkbox rows, Lunch and Dinner on', () => {
    open()
    const rows = within(dialog()).getAllByRole('checkbox')
    expect(rows.map((r) => r.getAttribute('aria-label') ?? r.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(/^Breakfast/), expect.stringMatching(/^Lunch/), expect.stringMatching(/^Dinner/),
    ])
    expect(row('Breakfast')).not.toBeChecked()
    expect(row('Lunch')).toBeChecked()
    expect(row('Dinner')).toBeChecked()
  })

  it('each row has an outlined time button named "<Name> time, <HH:MM>"', () => {
    open()
    for (const [n, t] of [['Breakfast', '07:30'], ['Lunch', '13:00'], ['Dinner', '19:30']] as const) {
      const b = within(dialog()).getByRole('button', { name: `${n} time, ${t}` })
      expect(b).toHaveAttribute('data-variant', 'secondary')
      expect(b).toHaveTextContent(t)
    }
  })

  it('names who is at the table', () => {
    open()
    expect(within(dialog()).getByText('At the table: Anna, Marco, Sam')).toBeInTheDocument()
  })

  it('with no Members the line is left out rather than reading "At the table: "', () => {
    open({ members: [] })
    expect(within(dialog()).queryByText(/At the table/)).toBeNull()
  })
})

describe('MealSlotQuickStartSheet: the footer', () => {
  it('has "Set up by hand" (secondary) and "Create 2 Meal Slots" (primary)', () => {
    open()
    const buttons = within(footer()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Set up by hand', 'Create 2 Meal Slots'])
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[1]).toHaveAttribute('data-variant', 'primary')
  })

  it('the count follows the ticked rows, in the singular at one, and Create is off at none', async () => {
    open()
    await userEvent.click(row('Breakfast'))
    expect(within(footer()).getByRole('button', { name: 'Create 3 Meal Slots' })).toBeEnabled()
    await userEvent.click(row('Lunch'))
    await userEvent.click(row('Dinner'))
    expect(within(footer()).getByRole('button', { name: 'Create 1 Meal Slot' })).toBeEnabled()
    await userEvent.click(row('Breakfast'))
    expect(within(footer()).getByRole('button', { name: /^Create/ })).toBeDisabled()
  })

  it('Create 2 Meal Slots makes Lunch and Dinner every day, in time order, in one call', async () => {
    const h = open()
    await userEvent.click(within(footer()).getByRole('button', { name: 'Create 2 Meal Slots' }))
    await waitFor(() => expect(h.onCreate).toHaveBeenCalledTimes(1))
    expect(h.onCreate).toHaveBeenCalledWith([
      { name: 'Lunch', time: '13:00', weekdays: EVERY_DAY },
      { name: 'Dinner', time: '19:30', weekdays: EVERY_DAY },
    ])
  })

  it('a ticked Breakfast comes first, in time order', async () => {
    const h = open()
    await userEvent.click(row('Breakfast'))
    await userEvent.click(within(footer()).getByRole('button', { name: 'Create 3 Meal Slots' }))
    await waitFor(() => expect(h.onCreate).toHaveBeenCalled())
    expect((h.onCreate.mock.calls[0] as unknown as [{ name: string }[]])[0].map((s) => s.name)).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  })

  it('Set up by hand calls onSetUpByHand and creates nothing', async () => {
    const h = open()
    await userEvent.click(within(footer()).getByRole('button', { name: 'Set up by hand' }))
    expect(h.onSetUpByHand).toHaveBeenCalledTimes(1)
    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('while saving, Create shows its spinner and does not send twice', async () => {
    const h = open({ saving: true })
    const create = within(footer()).getByRole('button', { name: 'Create 2 Meal Slots' })
    expect(create).toBeDisabled()
    await userEvent.click(create).catch(() => {})
    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('a refusal is the sheet\'s one error, in the sheet', () => {
    open({ error: 'Dinner already exists on Tuesday.' })
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Dinner already exists on Tuesday.')
  })
})

describe('MealSlotQuickStartSheet: another Meal Slot', () => {
  it('"Add another Meal Slot" is a secondary button that adds a ticked row with a Name field to fill', async () => {
    open()
    const add = within(dialog()).getByRole('button', { name: 'Add another Meal Slot' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(add)
    expect(within(dialog()).getAllByRole('checkbox')).toHaveLength(4)
    expect(within(dialog()).getByRole('textbox', { name: 'New Meal Slot name' })).toHaveFocus()
  })

  it('a named extra row is created with the others; an unnamed one is not (Create counts only named, ticked rows)', async () => {
    const h = open()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add another Meal Slot' }))
    expect(within(footer()).getByRole('button', { name: 'Create 2 Meal Slots' })).toBeInTheDocument()
    await userEvent.type(within(dialog()).getByRole('textbox', { name: 'New Meal Slot name' }), 'Snack')
    expect(within(footer()).getByRole('button', { name: 'Create 3 Meal Slots' })).toBeInTheDocument()
    await userEvent.click(within(footer()).getByRole('button', { name: 'Create 3 Meal Slots' }))
    await waitFor(() => expect(h.onCreate).toHaveBeenCalled())
    const sent = (h.onCreate.mock.calls[0] as unknown as [{ name: string; time: string; weekdays: number[] }[]])[0]
    expect(sent.map((s) => s.name)).toContain('Snack')
    expect(sent.find((s) => s.name === 'Snack')!.weekdays).toEqual(EVERY_DAY)
  })

  it('every control has its own accessible name (P38)', async () => {
    open()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add another Meal Slot' }))
    const names = within(dialog()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim())
    expect(new Set(names).size, names.join(' | ')).toBe(names.length)
  })
})
