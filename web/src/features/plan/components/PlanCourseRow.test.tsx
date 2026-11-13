// ds-plan (docs/design/system.md §3, §6): a Course row on a day tile is a ListRow.
//   [meta: "Main" | "Side"] [title: Recipe, body-strong, 2 lines, wraps at a word] [one line of chips] [Swap, Pin at the end]
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CourseRowModel } from '../lib/courses'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { PlanCourse } from '../types'
import { PlanCourseRow } from './PlanCourseRow'

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 2 }
const side = (over: Partial<PlanCourse> = {}) =>
  planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Two-colour cauliflower with peppers', recipeId: 8 }), ...over })

function setup(course = side(), caption: string | null = 'Side', today = '2026-11-10') {
  const h = { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn() }
  const row: CourseRowModel = { course, key, caption }
  const slot = courseSlot([planCourse({ meal: courseMeal(1, 'Main') }), course])
  const view = render(
    <MemoryRouter>
      <ul>
        <PlanCourseRow row={row} slot={slot} today={today} {...h} />
      </ul>
    </MemoryRouter>,
  )
  return { h, li: view.container.querySelector('li')! }
}

describe('PlanCourseRow: anatomy', () => {
  it('is a ListRow: the Course label in the meta line, the Recipe name as the title', () => {
    const { li } = setup()
    expect(li).toHaveClass('list-row')
    expect(li.querySelector('.list-row__meta')).toHaveTextContent('Side')
    expect(li.querySelector('.list-row__title')).toHaveTextContent('Two-colour cauliflower with peppers')
  })

  it('the whole row is one target named after the Recipe and opens the Planned Meal sheet of that Course', async () => {
    const { h } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Two-colour cauliflower with peppers' }))
    expect(h.onOpen).toHaveBeenCalledWith(key)
  })

  it('a lone row (no caption) has no meta line', () => {
    const { li } = setup(side(), null)
    expect(li.querySelector('.list-row__meta')).toBeNull()
  })

  it('"Side · without Sam" is shown as given in the meta line', () => {
    const { li } = setup(side(), 'Side · without Sam')
    expect(li.querySelector('.list-row__meta')).toHaveTextContent('Side · without Sam')
  })

  it('the Recipe name is never cut by the code: the full name is the title attribute and the accessible name', () => {
    const { li } = setup()
    expect(li.querySelector('.list-row__title')?.textContent).toBe('Two-colour cauliflower with peppers')
    expect(screen.getByRole('button', { name: 'Two-colour cauliflower with peppers' })).toBeInTheDocument()
  })
})

describe('PlanCourseRow: chips on one line', () => {
  const chipsOf = (li: Element) => li.querySelector('.plan-row__chips')

  it('the chips sit in one .plan-row__chips line under the meta, inside the row text', () => {
    const { li } = setup(side({ meal: courseMeal(2, 'Side', { servedFromLeftover: { date: '2026-11-09' } as never, why: [{ code: 'leftover_fits', date: '2026-11-13' }, { code: 'favourite', members: ['Mia'] }] }) }))
    const line = chipsOf(li)!
    expect(line.closest('.list-row__text')).not.toBeNull()
    expect(line.querySelectorAll('.chip')).toHaveLength(3)
    expect(line.children).toHaveLength(3) // direct chips only: no second line, no wrapper rows
  })

  it('Leftover from is the filled leftover chip; Leftover for is the outlined one; a favourite is a neutral why chip', () => {
    const { li } = setup(side({ meal: courseMeal(2, 'Side', { servedFromLeftover: { date: '2026-11-09' } as never, why: [{ code: 'leftover_fits', date: '2026-11-13' }, { code: 'favourite', members: ['Mia'] }] }) }))
    const from = within(li as HTMLElement).getByText('Leftover from Mon').closest('.chip')!
    const forChip = within(li as HTMLElement).getByText('Leftover for Fri').closest('.chip')!
    const fav = within(li as HTMLElement).getByText("Mia's favourite").closest('.chip')!
    expect(from).toHaveAttribute('data-status', 'leftover')
    expect(from).not.toHaveAttribute('data-outline')
    expect(forChip).toHaveAttribute('data-status', 'leftover')
    expect(forChip).toHaveAttribute('data-outline', 'true')
    expect(fav).toHaveAttribute('data-kind', 'why')
    expect(fav).not.toHaveAttribute('data-status')
  })

  it('every chip carries its full text as the tooltip', () => {
    const { li } = setup(side({ meal: courseMeal(2, 'Side', { why: [{ code: 'favourite', members: ['Mia', 'Fabio'] }] }) }))
    expect(chipsOf(li)!.querySelector('.chip')).toHaveAttribute('title', "Mia and Fabio's favourite")
  })

  it('a meal with nothing to say has no chip line at all', () => {
    const { li } = setup(side({ meal: courseMeal(2, 'Side') }))
    expect(chipsOf(li)).toBeNull()
  })

  it('a chip is not a second tap target inside the row: it is not a button', () => {
    const { li } = setup(side({ meal: courseMeal(2, 'Side', { why: [{ code: 'favourite', members: ['Mia'] }] }) }))
    expect(within(li as HTMLElement).queryAllByRole('button').map((b) => b.getAttribute('aria-label'))).not.toContain("Mia's favourite")
  })
})

describe('PlanCourseRow: icon actions', () => {
  it('Swap then Pin, in a group at the end of the row, after the text', () => {
    const { li } = setup()
    const group = li.querySelector('.plan-row__actions')!
    expect(within(group as HTMLElement).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Swap', 'Pin'])
    const text = li.querySelector('.list-row__text')!
    expect(text.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(group.closest('.list-row__trailing')).not.toBeNull()
  })

  it('Swap and Pin report that Course and do not open the sheet', async () => {
    const { h } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(h.onSwap).toHaveBeenCalledWith(key)
    expect(h.onPin).toHaveBeenCalledWith(key)
    expect(h.onOpen).not.toHaveBeenCalled()
  })

  it('a Pinned meal offers Unpin instead of Pin', async () => {
    const { h } = setup(side({ meal: courseMeal(2, 'Side', { pinned: true }) }))
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(h.onUnpin).toHaveBeenCalledWith(key)
  })

  it('Tab order: the row, then Swap, then Pin', async () => {
    setup()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Two-colour cauliflower with peppers' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Swap' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveFocus()
  })

  it('a Cooked row is muted (data-state), says Cooked, and has no Swap or Pin', () => {
    const { li } = setup(side({ meal: courseMeal(2, 'Side', { state: 'cooked' }) }))
    expect(li).toHaveAttribute('data-state', 'cooked')
    expect(screen.getByText('Cooked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
  })
})

describe('PlanCourseRow: an empty Course', () => {
  it('is a dashed row (data-unfilled) whose whole target is "Choose a Recipe" for that Course', async () => {
    const { h, li } = setup(side({ meal: null }))
    expect(li).toHaveAttribute('data-unfilled')
    await userEvent.click(screen.getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })

  it('the short reason is the row title, the "Not planned" chip (in the tone of its cause) is the one chip line, no sentence line', () => {
    const { li } = setup(side({ meal: null, unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 2, exclusion: 2, coolDown: 0, varietyRule: 0, advanceStep: 0 } } }))
    expect(li.querySelector('.list-row__title')).toHaveTextContent('Every Recipe is excluded.')
    const chip = li.querySelector('.plan-row__chips .chip')!
    expect(chip).toHaveTextContent('Not planned')
    expect(chip).toHaveAttribute('data-status', 'spoil') // a rule conflict: amber, never danger
    expect(li.querySelectorAll('.list-row__text > *').length).toBeLessThanOrEqual(3) // title, meta, chip line
  })

  it('an empty Course with no reason says "Nothing planned"', () => {
    const { li } = setup(side({ meal: null }))
    expect(li.querySelector('.list-row__title')).toHaveTextContent('Nothing planned')
  })

  it('nobody attending: no Choose a Recipe (there is nobody to cook for)', () => {
    const { li } = setup(side({ meal: null, unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } }))
    expect(screen.queryByRole('button', { name: 'Choose a Recipe' })).not.toBeInTheDocument()
    expect(li.querySelector('.list-row__title')).toHaveTextContent('Nobody is set to attend.')
    expect(li.querySelector('.plan-row__chips .chip')).toHaveAttribute('data-status', 'info')
  })
})
