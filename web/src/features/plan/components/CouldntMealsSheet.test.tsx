// B9-32 (PC-07): "Show which meals" opens a sheet listing the affected meals by day, each with Choose a Recipe, and holds the long explanation
// ("The planner fills each Course from the Recipes marked with it...") and the summary line that the compact tile no longer shows. TEST-AUTHOR tests.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, WEEK, dinner, empty, planned } from '../couldnt-fixtures'
import { useCouldntPlanNotice } from '../hooks/useCouldntPlanNotice'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import type { PlanSlot } from '../types'
import { CouldntMealsSheet } from './CouldntMealsSheet'

function Sheet({ slots, onChoose = vi.fn(), onClose = vi.fn(), open = true }: { slots: PlanSlot[]; onChoose?: () => void; onClose?: () => void; open?: boolean }) {
  const notice = useCouldntPlanNotice(unplannedOf(courseCells(slots)), courseCells(slots))
  return <CouldntMealsSheet open={open} onClose={onClose} groups={notice.groups} onChoose={onChoose} />
}
const view = (props: Parameters<typeof Sheet>[0]) => render(<MemoryRouter><Sheet {...props} /></MemoryRouter>)
const week = WEEK.map((d, i) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES), ...(i < 2 ? [empty(2, 'Side', EXCLUDED)] : [])]))

describe('CouldntMealsSheet', () => {
  it('is a dialog named "Couldn\'t plan" with the circular Close (it has no footer Cancel)', async () => {
    const onClose = vi.fn()
    view({ slots: week, onClose })
    const dialog = await screen.findByRole('dialog', { name: "Couldn't plan" })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('is closed when not open', () => {
    view({ slots: week, open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('one section per cause, titled like the tile row ("7 Desserts"), with the cause\'s long explanation once and the summary line', async () => {
    view({ slots: week })
    const dialog = await screen.findByRole('dialog', { name: "Couldn't plan" })
    const desserts = within(dialog).getByRole('region', { name: '7 Desserts' })
    expect(within(desserts).getByText('The planner fills each Course from the Recipes marked with it. Mark some Recipes with the Course, or choose a Recipe yourself.')).toBeInTheDocument()
    expect(within(desserts).getByText('Dessert at every dinner this week')).toBeInTheDocument()
    expect(within(dialog).getByRole('region', { name: '2 Sides' })).toBeInTheDocument()
  })

  it('lists the affected meals by day: a list per day named "Tue 10 Nov", one row per meal (the Meal Slot as title, the Course as meta)', async () => {
    view({ slots: week })
    const desserts = within(await screen.findByRole('dialog')).getByRole('region', { name: '7 Desserts' })
    const day = within(desserts).getByRole('list', { name: 'Tue 10 Nov' })
    const rows = within(day).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.querySelector('.list-row__title')).toHaveTextContent('Dinner')
    expect(rows[0]!.querySelector('.list-row__meta')).toHaveTextContent('Dessert')
    expect(within(desserts).getAllByRole('list')).toHaveLength(7)
  })

  it('every meal has "Choose a Recipe for <Course>, <day> <Meal Slot>" and it reports that Course key', async () => {
    const onChoose = vi.fn()
    view({ slots: week, onChoose })
    const button = await screen.findByRole('button', { name: 'Choose a Recipe for Dessert, Wed 11 Dinner' })
    await userEvent.click(button)
    expect(onChoose).toHaveBeenCalledWith({ date: '2026-11-11', mealSlotId: 4, courseId: 3 })
  })

  it('the lines of the Excluded cause go to their cell on Review Exclusions (a link named like the line), as the old "Show all" did', async () => {
    view({ slots: week })
    const sides = within(await screen.findByRole('dialog')).getByRole('region', { name: '2 Sides' })
    expect(within(sides).getByRole('link', { name: 'Wed 11 Nov · Dinner · Side' })).toHaveAttribute('href', '/plan/couldnt-plan/excluded#cell-2026-11-11-4-2')
  })

  it('no two buttons in the sheet share a name', async () => {
    view({ slots: week })
    const names = within(await screen.findByRole('dialog')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(new Set(names).size).toBe(names.length)
  })

  it('a meal nobody attends has no Choose a Recipe (there is nobody to cook for)', async () => {
    view({ slots: WEEK.slice(0, 2).map((d) => dinner(d, [empty(1, 'Main', NOBODY)])) })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    expect(within(dialog).queryByRole('button', { name: /^Choose a Recipe/ })).not.toBeInTheDocument()
  })
})
