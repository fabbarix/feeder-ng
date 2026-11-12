// CRS F (spec 7.5): the slot block's menu. Keyboard and ARIA come from the shared Menu; this pins what it holds.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import { SlotMenu } from './SlotMenu'

const main = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
const side = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
const dessert = planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' })

function setup(s = courseSlot([main, side]), today = '2026-11-10') {
  const h = { onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() }
  render(
    <MemoryRouter>
      <SlotMenu slot={s} today={today} {...h} />
    </MemoryRouter>,
  )
  return h
}

describe('SlotMenu', () => {
  it('is a menu button named after the slot', () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Dinner actions' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('holds Mark all Cooked, Not cooked: whole slot and Add <Course>, in that order', async () => {
    setup(courseSlot([main, side, dessert]))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Mark all Cooked', 'Not cooked: whole slot', 'Add Dessert'])
  })

  it('opens from the keyboard and Enter picks the focused entry', async () => {
    const h = setup()
    screen.getByRole('button', { name: 'Dinner actions' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Mark all Cooked' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(h.onNotCookedSlot).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
  })

  it('a future slot has only Add entries; with none it renders nothing', async () => {
    setup(courseSlot([main, side, dessert]), '2026-11-09')
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Add Dessert'])
  })

  it('renders nothing for a one-Course slot', () => {
    const { container } = render(
      <MemoryRouter>
        <SlotMenu slot={slot()} today="2026-11-10" onMarkAllCooked={() => {}} onNotCookedSlot={() => {}} onAddCourse={() => {}} />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
