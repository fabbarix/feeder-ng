// B9-38 (PC-10, PC-16 8, SHORT-02): the Swap sheet names its day, Meal Slot and Course; "Now" and "Instead"; real chips under the row's text.
// 2026-11-10 is a Tuesday. The slot's Dinner has one Course ("Main") unless a test builds more.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { Alternative, PlanSlot } from '../types'
import { SwapSheet } from './SwapSheet'

const alt = (id: number, name: string, extra: Partial<Alternative> = {}): Alternative => ({
  recipeId: id, recipeName: name, batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, why: [], ...extra,
})
const alternatives = [
  alt(1, 'Frozen lasagne', { newLeftoverPortions: 1.25, relaxed: true, why: [{ code: 'cooldown_relaxed', date: '2026-11-12', recipeId: 1 }] }),
  alt(2, 'Lentil soup', { why: [{ code: 'perishable_use', ingredient: 'lentils', date: '2026-11-12' }, { code: 'favourite', members: ['Ben'] }] }),
  alt(3, 'Pancakes'),
]
const current: PlanSlot = slot({ meal: meal({ recipeName: 'Risotto ai funghi', why: [{ code: 'perishable_use', ingredient: 'mushrooms', date: '2026-11-11' }] }) })

function setup(over: Partial<React.ComponentProps<typeof SwapSheet>> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<SwapSheet open onClose={onClose} slot={current} alternatives={alternatives} isLoading={false} onPick={onPick} {...over} />)
  return { onPick, onClose, dialog: within(screen.getByRole('dialog')) }
}

describe('the header (PC-10)', () => {
  it('the context line names the day, Meal Slot and Course; the title names the Recipe being swapped', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg.querySelector('.sheet__context')).toHaveTextContent('Tue 10 · Dinner · Main')
    expect(dlg).toHaveAccessibleName('Tue 10 · Dinner · Main Swap Risotto ai funghi')
  })

  it('swaps the Course it is given: the Side of a slot with several Courses', () => {
    const dinner = courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken' }) }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans' }) })])
    setup({ slot: dinner, courseId: 2 })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Tue 10 · Dinner · Side Swap Green beans')
  })

  it('no ISO date, and no "Swap for…" title', () => {
    setup()
    expect(screen.getByRole('dialog').textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(screen.queryByText('Swap for…')).toBeNull()
  })
})

describe('Now and Instead', () => {
  it('"Now" lists the current Recipe with its chips and is not a button (nothing to do with it); "Instead" lists the alternatives', () => {
    const { dialog } = setup()
    const now = dialog.getByRole('list', { name: 'Now' })
    expect(within(now).getAllByRole('listitem')).toHaveLength(1)
    expect(within(now).getByText('Risotto ai funghi')).toBeInTheDocument()
    expect(within(now).getByText('uses mushrooms by Wed')).toBeInTheDocument()
    expect(within(now).queryByRole('button')).toBeNull()
    expect(within(dialog.getByRole('list', { name: 'Instead' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('a row has a neutral monogram with the Recipe\'s initial', () => {
    const { dialog } = setup()
    const thumbs = dialog.getByRole('list', { name: 'Instead' }).querySelectorAll('.recipe-thumb')
    expect(thumbs).toHaveLength(3)
    for (const t of thumbs) expect(t).toHaveAttribute('data-tone', 'neutral')
    expect(thumbs[0]).toHaveTextContent('F')
  })

  it('the reasons are real chips in the row\'s `below` slot, never meta text', () => {
    const { dialog } = setup()
    const rows = within(dialog.getByRole('list', { name: 'Instead' })).getAllByRole('listitem')
    const soup = rows[1]!
    const chips = [...soup.querySelectorAll('.list-row__below .chip')].map((c) => c.textContent)
    expect(chips).toEqual(['uses lentils by Thu', "Ben's favourite"])
    expect(soup.querySelector('.list-row__meta')).toBeNull()
    expect(rows[0]!.querySelector('.list-row__below .chip')).toHaveTextContent('Again soon: also on Thu')
  })

  it('a row with no reason renders no chip line', () => {
    const { dialog } = setup()
    const pancakes = within(dialog.getByRole('list', { name: 'Instead' })).getAllByRole('listitem')[2]!
    expect(pancakes.querySelector('.list-row__below')).toBeNull()
  })

  it('the Leftover an alternative would leave sits in the value column: "+1.25 Leftover"', () => {
    const { dialog } = setup()
    const first = within(dialog.getByRole('list', { name: 'Instead' })).getAllByRole('listitem')[0]!
    expect(first.querySelector('.list-row__value')).toHaveTextContent('+1.25 Leftover')
  })

  it('tapping a row picks that Recipe', async () => {
    const { onPick, dialog } = setup()
    await userEvent.click(dialog.getByRole('button', { name: 'Lentil soup' }))
    expect(onPick).toHaveBeenCalledWith(2)
  })
})

describe('the note and the footer', () => {
  it('says later meals may move and can be reviewed and undone', () => {
    const { dialog } = setup()
    expect(dialog.getByText("Later meals that aren't Pinned may move to make room. You can review and undo them.")).toBeInTheDocument()
  })

  it('"Keep it" is the footer\'s only button (outlined) and there is no Close', async () => {
    const { onClose, dialog } = setup()
    const footer = screen.getByRole('dialog').querySelector('.sheet__footer')!
    expect([...footer.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Keep it'])
    expect(dialog.getByRole('button', { name: 'Keep it' })).toHaveAttribute('data-variant', 'secondary')
    expect(dialog.queryByRole('button', { name: 'Close' })).toBeNull()
    await userEvent.click(dialog.getByRole('button', { name: 'Keep it' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('while loading or with nothing else, the "Now" row still shows', () => {
    setup({ alternatives: [], isLoading: true })
    expect(screen.getByRole('list', { name: 'Now' })).toBeInTheDocument()
    expect(screen.getByText('Finding alternatives…')).toBeInTheDocument()
  })
})
