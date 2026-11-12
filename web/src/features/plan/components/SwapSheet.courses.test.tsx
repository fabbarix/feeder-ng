// CRS F (spec 7.3): Swap works on one Course; strict alternatives first, relaxed last with their chip; a Whole meal names what it covers.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { Alternative } from '../types'
import { SwapSheet } from './SwapSheet'

const alt = (id: number, name: string, extra: Partial<Alternative> = {}): Alternative => ({
  recipeId: id, recipeName: name, batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, why: [], ...extra,
})
const s = courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main') }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })])

function setup(alternatives: Alternative[]) {
  const onPick = vi.fn()
  render(<SwapSheet open onClose={() => {}} slot={s} alternatives={alternatives} isLoading={false} onPick={onPick} />)
  return { onPick }
}
const rowNames = () => within(screen.getByRole('list', { name: 'Alternatives' })).getAllByRole('listitem').map((li) => li.textContent ?? '')

describe('SwapSheet with Courses', () => {
  it('a Whole meal for the main Course says "Whole meal: no Side"', () => {
    setup([alt(1, 'Lasagne', { wholeMeal: true, covers: ['Side'] }), alt(2, 'Stew')])
    const [first] = rowNames()
    expect(first).toContain('Lasagne')
    expect(first).toContain('Whole meal: no Side')
  })

  it('a relaxed alternative shows its relaxed chip, and stays after the strict ones', () => {
    setup([
      alt(1, 'Stew', { why: [{ code: 'favourite', members: ['Ben'] }] }),
      alt(2, 'Pizza'),
      alt(3, 'Soup', { relaxed: true, why: [{ code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 3 }] }),
    ])
    const rows = rowNames()
    expect(rows.map((r) => r.includes('Soup'))).toEqual([false, false, true])
    expect(rows[2]).toContain('Again soon: had Sun')
  })

  it('choosing a row reports the Recipe', async () => {
    const h = setup([alt(1, 'Lasagne', { wholeMeal: true, covers: ['Side'] })])
    await userEvent.click(screen.getByRole('button', { name: /Lasagne/ }))
    expect(h.onPick).toHaveBeenCalledWith(1)
  })
})
