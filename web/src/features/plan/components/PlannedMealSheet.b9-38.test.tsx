// B9-38 (PC-09, PC-10, SHORT-02): the Planned Meal sheet's header, footer, ⋮ and states. 2026-11-10 is a Tuesday and "today".
//   header   the context line (lib/days slotContext) above the title, BottomSheet's `context`; ONE round Close, no Cancel
//   footer   ONE FormActions row (never `.plan-sheet__actions`): ⋮ "More for Tue Dinner" first, the outlined secondary, the primary last
//   body     the facts, Attendance avatars, chips, the start note, "Open Recipe" as a link row; a Cooked meal's Leftover block
//   focus    on open the title takes focus (never Cook or Undo, so Enter cannot act); after Undo, Cook
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Leftover } from '../../../lib/leftovers/types'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { MealResolution, PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

afterEach(() => vi.unstubAllGlobals())

const today = '2026-11-10'
const slotKey = { date: today, mealSlotId: 2 }
const key = { ...slotKey, courseId: 1 }
const resolution = (over: Partial<MealResolution> = {}): MealResolution => ({ kind: 'cooked', markedOn: today, markedAt: '2026-11-10T12:40:00Z', markedBy: 'Anna', leftoverPortions: 1.25, canUndo: true, ...over })
const leftover: Leftover = {
  id: 9, recipeId: 7, recipeName: 'Chicken curry', portions: 2.5, cookedOn: today, useBy: '2026-11-13', fromDate: today, fromMealSlotId: 2,
  storagePlaceId: null, storagePlaceName: null, frozen: false, frozenOn: null, toAnswer: false, plannedPortions: 1.25,
}

function setup(s: PlanSlot | null = slot(), props: Record<string, unknown> = {}, courseId = 1) {
  const h = {
    onClose: vi.fn(), onCook: vi.fn(), onMarkCooked: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn(),
    onNotCooked: vi.fn(), onUndoCooked: vi.fn(), onUndoNotCooked: vi.fn(), onCookedAfterAll: vi.fn(), onLeftoverAction: vi.fn(),
  }
  const ui = (p: Record<string, unknown>, sl: PlanSlot | null) => (
    <MemoryRouter>
      <PlannedMealSheet open slot={sl} courseId={courseId} today={today} timeZone="Europe/Rome" {...h} {...p} />
    </MemoryRouter>
  )
  const view = render(ui(props, s))
  return { ...h, view, redo: (p: Record<string, unknown>, sl: PlanSlot | null) => view.rerender(ui(p, sl)) }
}
const dialog = () => within(screen.getByRole('dialog'))
const footer = () => screen.getByRole('dialog').querySelector<HTMLElement>('.sheet__footer')!
const footerButtons = () => [...(footer()?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())
const dinnerWith = (courses = [planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken' }) }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8 }) })]) =>
  courseSlot(courses, { date: today, mealSlotId: 2, name: 'Dinner', time: '19:00' })

describe('PC-09 / PC-10: the header names the day, Meal Slot and Course', () => {
  it('the context line sits above the Recipe title and is part of the dialog name', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg.querySelector('.sheet__context')).toHaveTextContent('Tue 10 · Dinner 19:00')
    expect(dlg).toHaveAccessibleName('Tue 10 · Dinner 19:00 Chicken curry')
    expect(dialog().getByRole('heading', { name: 'Chicken curry' })).toBeInTheDocument()
  })

  it('a slot with several Courses names the Course: "Tue 10 · Dinner 19:00 · Side"', () => {
    setup(dinnerWith(), {}, 2)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Tue 10 · Dinner 19:00 · Side Green beans')
  })

  it('no ISO date appears anywhere in the sheet', () => {
    setup(slot({ meal: meal({ why: [{ code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }], startsAt: { date: '2026-11-09', time: '21:30' } }) }))
    expect(screen.getByRole('dialog').textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('has one Close (round, outline) and no Cancel', () => {
    setup()
    expect(dialog().getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(dialog().queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})

describe('SHORT-02 / PC-09: the footer is one FormActions row', () => {
  it("today's meal: ⋮ first, Mark as Cooked (outlined), Cook (primary) last", () => {
    setup()
    expect(footerButtons()).toEqual(['More for Tue Dinner', 'Mark as Cooked', 'Cook'])
    expect(dialog().getByRole('button', { name: 'Cook' })).toHaveAttribute('data-variant', 'primary')
    expect(dialog().getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'secondary')
    expect(dialog().getByRole('button', { name: 'More for Tue Dinner' })).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('is one `.form-actions` row with at most 3 controls, and the old stacked column is gone', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(footer().querySelectorAll('.form-actions')).toHaveLength(1)
    expect(footer().querySelectorAll('button').length).toBeLessThanOrEqual(3)
    expect(dlg.querySelector('.plan-sheet__actions')).toBeNull()
  })

  it('names the Course in the ⋮ when the slot has several: "More for Tue Dinner Side"', () => {
    setup(dinnerWith(), {}, 2)
    expect(footerButtons()[0]).toBe('More for Tue Dinner Side')
  })

  it('the footer buttons keep their label on one line (P30 measures them)', () => {
    setup()
    for (const name of ['Cook', 'Mark as Cooked']) expect(dialog().getByRole('button', { name })).toHaveAttribute('data-one-line')
  })

  it('Cook and Mark as Cooked report the slot and the Course', async () => {
    const h = setup()
    await userEvent.click(dialog().getByRole('button', { name: 'Cook' }))
    await userEvent.click(dialog().getByRole('button', { name: 'Mark as Cooked' }))
    expect(h.onCook).toHaveBeenCalledWith(slotKey)
    expect(h.onMarkCooked).toHaveBeenCalledWith(key)
  })

  it('a meal served from a Leftover has Reheat as its primary', async () => {
    const h = setup(slot({ meal: meal({ servedFromLeftover: { leftoverId: 4, date: '2026-11-08', mealSlotId: 2, recipeName: 'Chicken curry' } }) }))
    expect(dialog().queryByRole('button', { name: 'Cook' })).toBeNull()
    await userEvent.click(dialog().getByRole('button', { name: 'Reheat' }))
    expect(h.onCook).toHaveBeenCalledWith(slotKey)
  })

  it('a future meal: Cook (primary) and Swap (outlined); Mark as Cooked waits in the ⋮ with its date', async () => {
    stubViewportWidth(1024)
    setup(slot({ date: '2026-11-11', meal: meal({ date: '2026-11-11' }) }))
    expect(footerButtons()).toEqual(['More for Wed Dinner', 'Swap', 'Cook'])
    await userEvent.click(dialog().getByRole('button', { name: 'More for Wed Dinner' }))
    const item = screen.getByRole('menuitem', { name: 'Mark as Cooked · from Wed 11' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
  })

  it('a past meal still waiting has Mark as Cooked as its primary and no Cook', () => {
    setup(slot({ date: '2026-11-08', meal: meal({ date: '2026-11-08' }) }))
    expect(dialog().queryByRole('button', { name: 'Cook' })).toBeNull()
    expect(dialog().getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'primary')
  })
})

describe('the ⋮ "More for Tue Dinner" holds Swap, Pin, Choose a Recipe and Not cooked', () => {
  const open = async (s: PlanSlot = slot(), props: Record<string, unknown> = {}) => {
    stubViewportWidth(1024)
    const h = setup(s, props)
    await userEvent.click(dialog().getByRole('button', { name: 'More for Tue Dinner' }))
    return h
  }
  const items = () => within(screen.getByRole('menu', { name: 'More for Tue Dinner' })).getAllByRole('menuitem').map((i) => i.textContent)

  it('lists them in order', async () => {
    await open()
    expect(items()).toEqual(['Swap', 'Pin', 'Choose a Recipe', 'Not cooked'])
  })

  it('a Pinned meal offers Unpin', async () => {
    await open(slot({ meal: meal({ pinned: true }) }))
    expect(items()).toEqual(['Swap', 'Unpin', 'Choose a Recipe', 'Not cooked'])
  })

  it.each([
    ['Swap', 'onSwap'],
    ['Pin', 'onPin'],
    ['Choose a Recipe', 'onChoose'],
    ['Not cooked', 'onNotCooked'],
  ])('%s reports the Course', async (label, handler) => {
    const h = await open()
    await userEvent.click(screen.getByRole('menuitem', { name: label }))
    expect((h as unknown as Record<string, ReturnType<typeof vi.fn>>)[handler]).toHaveBeenCalledWith(key)
  })

  it('Unpin reports the Course', async () => {
    const h = await open(slot({ meal: meal({ pinned: true }) }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unpin' }))
    expect(h.onUnpin).toHaveBeenCalledWith(key)
  })

  it('below 768 px the items open as a sheet titled "More for Tue Dinner"', async () => {
    stubViewportWidth(390)
    setup()
    await userEvent.click(dialog().getByRole('button', { name: 'More for Tue Dinner' }))
    expect(screen.getByRole('dialog', { name: 'More for Tue Dinner' })).toBeInTheDocument()
  })
})

describe('the body', () => {
  it('the facts line adds the cooking time and when to start', () => {
    setup(slot({ meal: meal({ batches: 1, portions: 2.75, cookMinutes: 45, startBy: '18:15' }) }))
    expect(dialog().getByText('1 Batch · 2.75 portions · 45 min · start 18:15')).toBeInTheDocument()
  })

  it('"Open Recipe" is a link row to the Recipe, saying what is there', () => {
    setup(slot({ meal: meal({ recipeId: 7, portions: 2.75 }) }))
    const link = dialog().getByRole('link', { name: /Open Recipe/ })
    expect(link).toHaveAttribute('href', '/recipes/7')
    expect(dialog().getByText('Ingredients for 2.75 portions, Steps, Notes')).toBeInTheDocument()
  })

  it('says why a Pinned meal would start outside the cooking times', () => {
    setup(slot({ meal: meal({ pinned: true, earlyStart: '02:30' }) }))
    expect(dialog().getByText('Cooking would start at 02:30, outside your cooking times.')).toBeInTheDocument()
  })

  it('says when to start a meal that has to be started on an earlier day', () => {
    setup(slot({ meal: meal({ startsAt: { date: '2026-11-09', time: '21:30' } }) }))
    expect(dialog().getByText('Start cooking on Monday at 21:30.')).toBeInTheDocument()
  })

  it('has no start line for an ordinary meal', () => {
    setup()
    expect(dialog().queryByText(/Cooking would start|Start cooking on/)).toBeNull()
  })
})

describe('a Cooked meal (SAFE-03)', () => {
  const cooked = (over = {}) => slot({ meal: meal({ state: 'cooked', resolution: resolution(), ...over }) })

  it('shows the success chip, the summary and the hint, with Undo Cooked as the only footer button (outlined)', () => {
    setup(cooked())
    expect(dialog().getByText('Cooked')).toBeInTheDocument()
    expect(dialog().getByText(/^Marked Cooked today at 13:40 by Anna\./)).toBeInTheDocument()
    expect(footerButtons()).toEqual(['Undo Cooked'])
    expect(dialog().getByRole('button', { name: 'Undo Cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('Open Recipe is still there, without portions', () => {
    setup(cooked())
    expect(dialog().getByRole('link', { name: /Open Recipe/ })).toHaveAttribute('href', '/recipes/7')
    expect(dialog().getByText('Ingredients, Steps, Notes')).toBeInTheDocument()
  })

  it('the Leftover it made is a block with Had it, Freeze it and a ⋮ "More for the Leftover"', async () => {
    stubViewportWidth(1024)
    const h = setup(cooked(), { leftover })
    const block = dialog().getByRole('group', { name: 'Leftover of Chicken curry' })
    expect(within(block).getByText('2.5 portions left · Use by Fri')).toBeInTheDocument()
    expect(within(block).getByText('1.25 portions planned. 1.25 not planned yet.')).toBeInTheDocument()
    await userEvent.click(within(block).getByRole('button', { name: 'Had it' }))
    expect(h.onLeftoverAction).toHaveBeenCalledWith('had-it', leftover)
    await userEvent.click(within(block).getByRole('button', { name: 'Freeze it' }))
    expect(h.onLeftoverAction).toHaveBeenCalledWith('freeze', leftover)
    expect(within(block).getByRole('button', { name: 'More for the Leftover' })).toHaveAttribute('aria-haspopup', 'menu')
    for (const b of within(block).getAllByRole('button')) expect(b.getAttribute('data-variant') ?? 'icon').not.toBe('primary')
    await userEvent.click(within(block).getByRole('button', { name: 'More for the Leftover' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Threw it out' }))
    expect(h.onLeftoverAction).toHaveBeenCalledWith('threw-out', leftover)
  })

  it('has no Leftover block without a Leftover, and none on a planned meal', () => {
    setup(cooked())
    expect(dialog().queryByRole('group', { name: /^Leftover of/ })).toBeNull()
  })

  it('once Undo is not allowed the hint says why and there is no button', () => {
    setup(cooked({ resolution: resolution({ canUndo: false, cannotUndo: 'leftover_used' }) }))
    expect(footerButtons()).toEqual([])
    expect(dialog().getByText("Some of its Leftover was already had, so Cooked can't be undone.")).toBeInTheDocument()
  })
})

describe('a Not cooked meal', () => {
  it('shows a neutral Not cooked chip, then Cooked after all (primary) and Undo Not cooked (outlined)', () => {
    setup(slot({ meal: meal({ state: 'skipped', resolution: resolution({ kind: 'not_cooked', leftoverPortions: 0 }) }) }))
    expect(footerButtons()).toEqual(['Undo Not cooked', 'Cooked after all'])
    expect(dialog().getByRole('button', { name: 'Cooked after all' })).toHaveAttribute('data-variant', 'primary')
    expect(dialog().getByRole('button', { name: 'Undo Not cooked' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('dialog').querySelector('.chip[data-status="neutral"]')).toHaveTextContent('Not cooked')
  })
})

describe('focus', () => {
  it('opens on the title, not on Cook', () => {
    setup()
    expect(dialog().getByRole('heading', { name: 'Chicken curry' })).toHaveFocus()
  })

  it('opens a Cooked meal on the title too (Enter must not undo it)', () => {
    setup(slot({ meal: meal({ state: 'cooked', resolution: resolution() }) }))
    expect(dialog().getByRole('heading', { name: 'Chicken curry' })).toHaveFocus()
  })

  it('after Undo Cooked, focus goes to Cook', async () => {
    const h = setup(slot({ meal: meal({ state: 'cooked', resolution: resolution() }) }))
    await userEvent.click(dialog().getByRole('button', { name: 'Undo Cooked' }))
    h.redo({}, slot())
    expect(dialog().getByRole('button', { name: 'Cook' })).toHaveFocus()
  })
})
