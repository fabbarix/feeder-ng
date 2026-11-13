// B5-LOW: a Planned Meal served from a Leftover links to it: "From Mon's Chilli".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { meal, slot } from '../test-utils'
import { PlannedMealSheet } from './PlannedMealSheet'

const served = (leftoverId: number | null) =>
  slot({ meal: meal({ batches: 0, portions: 2, recipeName: 'Chilli', servedFromLeftover: { leftoverId, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chilli' } }) })

function setup(s = served(4)) {
  const onOpenLeftover = vi.fn()
  render(
    <PlannedMealSheet open slot={s} courseId={1} today="2026-11-10" onClose={() => {}} onCook={() => {}} onMarkCooked={() => {}} onSwap={() => {}} onPin={() => {}} onUnpin={() => {}} onChoose={() => {}} onOpenLeftover={onOpenLeftover} />,
  )
  return { onOpenLeftover }
}

describe('PlannedMealSheet: From a Leftover', () => {
  it("has a link named after the day it was cooked and the Recipe, which opens that Leftover", async () => {
    const { onOpenLeftover } = setup()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "From Mon's Chilli" }))
    expect(onOpenLeftover).toHaveBeenCalledWith(4)
  })
  it('has no link without a Leftover id, or for a meal that is cooked fresh', () => {
    setup(served(null))
    expect(screen.queryByRole('button', { name: /^From / })).toBeNull()
  })
  it('has no link on a meal that is not served from a Leftover', () => {
    setup(slot())
    expect(screen.queryByRole('button', { name: /^From / })).toBeNull()
  })
})
