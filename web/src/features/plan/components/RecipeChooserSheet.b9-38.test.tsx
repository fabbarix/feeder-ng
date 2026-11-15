// B9-38 (PC-10, RX-08, PC-16 8): Choose a Recipe names its day, Meal Slot and Course, says "6 h", groups by the Course's marks, and puts
// the search field in focus for a fine pointer. 2026-11-10 is a Tuesday.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Leftover } from '../../../lib/leftovers/types'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import type { PlanSlot, RecipeChoice } from '../types'
import { RecipeChooserSheet } from './RecipeChooserSheet'

afterEach(() => vi.unstubAllGlobals())

const r = (id: number, name: string, over: Partial<RecipeChoice> = {}): RecipeChoice => ({ id, name, tags: [], ...over })
const dessertSlot: PlanSlot = courseSlot([
  planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main') }),
  planCourse({ courseId: 3, name: 'Dessert', main: false }),
])
const recipes = [
  r(1, 'Lemon ricotta cake', { courseIds: [3], totalMinutes: 50 }),
  r(2, 'Baked apples with cinnamon', { courseIds: [1], totalMinutes: 360 }),
  r(3, 'Pancakes', { courseIds: [1, 3] }),
  r(4, 'Plain rice'),
]
const frozen: Leftover = {
  id: 5, recipeId: 3, recipeName: 'Pancakes', portions: 3, cookedOn: '2026-11-01', useBy: '2026-12-01', fromDate: '2026-11-01', fromMealSlotId: 2,
  storagePlaceId: 1, storagePlaceName: 'Freezer', frozen: true, frozenOn: '2026-11-02', toAnswer: false, plannedPortions: 0,
}

function setup(over: Partial<React.ComponentProps<typeof RecipeChooserSheet>> = {}) {
  const onPick = vi.fn()
  render(<RecipeChooserSheet open onClose={() => {}} recipes={recipes} isLoading={false} onPick={onPick} slot={dessertSlot} courseId={3} {...over} />)
  return { onPick, dialog: within(screen.getByRole('dialog')) }
}
const names = (list: HTMLElement) => within(list).getAllByRole('listitem').map((li) => li.querySelector('.list-row__title')?.textContent)

describe('the header (PC-10)', () => {
  it('names the day, Meal Slot and Course above "Choose a Recipe"', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg.querySelector('.sheet__context')).toHaveTextContent('Tue 10 · Dinner · Dessert')
    expect(dlg).toHaveAccessibleName('Tue 10 · Dinner · Dessert Choose a Recipe')
  })

  it('the main Course is named too', () => {
    setup({ slot: slot(), courseId: 1 })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Tue 10 · Dinner · Main Choose a Recipe')
  })

  it('has one round Close and no Cancel; no ISO date', () => {
    const { dialog } = setup()
    expect(dialog.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(dialog.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.getByRole('dialog').textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('the list', () => {
  it('a Course other than the main one: "Marked as Dessert", "From the freezer", then "Other Recipes", in that order', () => {
    const { dialog } = setup({ frozenLeftovers: [frozen] })
    const lists = dialog.getAllByRole('list').map((l) => l.getAttribute('aria-label'))
    expect(lists).toEqual(['Marked as Dessert', 'From the freezer', 'Other Recipes'])
    expect(names(dialog.getByRole('list', { name: 'Marked as Dessert' }))).toEqual(['Lemon ricotta cake', 'Pancakes'])
    expect(names(dialog.getByRole('list', { name: 'Other Recipes' }))).toEqual(['Baked apples with cinnamon', 'Plain rice'])
  })

  it('each Recipe of "Other Recipes" carries the info chip "Not marked as Dessert"; the marked ones do not', () => {
    const { dialog } = setup()
    for (const li of within(dialog.getByRole('list', { name: 'Other Recipes' })).getAllByRole('listitem')) {
      const chip = li.querySelector('.list-row__below .chip')
      expect(chip).toHaveAttribute('data-status', 'info')
      expect(chip).toHaveTextContent('Not marked as Dessert')
    }
    expect(dialog.getByRole('list', { name: 'Marked as Dessert' }).querySelector('.chip')).toBeNull()
  })

  it('the main Course is one list "Recipes" with no chips', () => {
    const { dialog } = setup({ slot: slot(), courseId: 1 })
    expect(dialog.getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Recipes'])
    expect(dialog.getByRole('list', { name: 'Recipes' }).querySelector('.chip')).toBeNull()
  })

  it('RX-08: the time reads "6 h", "50 min" (formatMinutes), never "360 min"', () => {
    const { dialog } = setup()
    expect(dialog.getByText('6 h')).toBeInTheDocument()
    expect(dialog.getByText('50 min')).toBeInTheDocument()
    expect(screen.getByRole('dialog').textContent).not.toMatch(/360 min/)
  })

  it('PC-16 8: the monograms are neutral', () => {
    const { dialog } = setup()
    const thumbs = dialog.getAllByRole('list')[0]!.querySelectorAll('.recipe-thumb')
    expect(thumbs.length).toBeGreaterThan(0)
    for (const t of thumbs) expect(t).toHaveAttribute('data-tone', 'neutral')
  })

  it('a search narrows every group, and a group with nothing left disappears', async () => {
    const { dialog } = setup()
    await userEvent.type(dialog.getByRole('searchbox'), 'rice')
    expect(dialog.getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Other Recipes'])
  })

  it('choosing a row picks that Recipe', async () => {
    const { onPick, dialog } = setup()
    await userEvent.click(dialog.getByRole('button', { name: 'Lemon ricotta cake' }))
    expect(onPick).toHaveBeenCalledWith(1)
  })
})

describe('the search field', () => {
  it('is labelled with the Course: "Search Dessert Recipes" ("Search Recipes" for the main Course)', () => {
    setup()
    expect(screen.getByRole('searchbox', { name: 'Search Dessert Recipes' })).toBeInTheDocument()
  })

  it('has focus on open with a fine pointer (a mouse)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: fine'), media: q, addEventListener() {}, removeEventListener() {} }))
    setup()
    expect(screen.getByRole('searchbox', { name: 'Search Dessert Recipes' })).toHaveFocus()
  })

  it('on touch the title takes focus, so no keyboard covers the list', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
    setup()
    expect(screen.getByRole('heading', { name: 'Choose a Recipe' })).toHaveFocus()
  })
})
