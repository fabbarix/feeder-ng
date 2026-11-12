// CRS F (spec 11): the Course menu of the Cook Mode header: Mark <Course> as Cooked and Not cooked, for one Course at any time.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMenuEntries } from '../lib/timeline'
import { timelineView } from '../timeline-fixtures'
import { CourseMenu } from './CourseMenu'

const entries = () => courseMenuEntries(timelineView())

function setup(list = entries()) {
  const h = { onCooked: vi.fn(), onNotCooked: vi.fn() }
  const view = render(
    <MemoryRouter>
      <CourseMenu entries={list} {...h} />
    </MemoryRouter>,
  )
  return { ...h, container: view.container }
}

describe('CourseMenu', () => {
  it('is a menu button named Course actions', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Course actions' })).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('lists Mark <Course> as Cooked and Not cooked: <Course> per Course', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Mark Main as Cooked', 'Not cooked: Main', 'Mark Side as Cooked', 'Not cooked: Side'])
  })

  it('choosing reports the Course', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark Side as Cooked' }))
    expect(h.onCooked).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not cooked: Main' }))
    expect(h.onNotCooked).toHaveBeenCalledWith(1)
  })

  it('works from the keyboard: Enter opens on the first item, arrows move, Escape closes', async () => {
    const h = setup()
    screen.getByRole('button', { name: 'Course actions' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Mark Main as Cooked' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(h.onCooked).toHaveBeenCalledWith(2)
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders nothing without entries (a one-Course slot)', () => {
    expect(setup([]).container).toBeEmptyDOMElement()
  })
})
