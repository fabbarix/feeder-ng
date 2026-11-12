// CRS E2: the Course filter of the Recipes list (keyboard and ARIA).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import { CourseFilter } from './CourseFilter'

const view = (selected: number | null = null, courses = courseChoices) => {
  const onSelect = vi.fn()
  render(<CourseFilter courses={courses} selected={selected} onSelect={onSelect} />)
  return onSelect
}

describe('CourseFilter', () => {
  it('is a group named "Filter by Course" with All Courses first, then one chip per Course in household order', () => {
    view()
    const group = screen.getByRole('group', { name: 'Filter by Course' })
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['All Courses', 'Main', 'Side', 'Starter', 'Dessert'])
  })
  it('presses All Courses when no Course is selected, and the selected Course otherwise', () => {
    view(null)
    expect(screen.getByRole('button', { name: 'All Courses' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('presses the selected Course', () => {
    view(2)
    expect(screen.getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All Courses' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('chooses a Course with a click, and All Courses clears it', async () => {
    const onSelect = view(2)
    await userEvent.click(screen.getByRole('button', { name: 'Dessert' }))
    expect(onSelect).toHaveBeenLastCalledWith(4)
    await userEvent.click(screen.getByRole('button', { name: 'All Courses' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
  it('pressing the selected Course again clears the filter', async () => {
    const onSelect = view(2)
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
  it('works from the keyboard: every chip is a tab stop and Space and Enter choose', async () => {
    const onSelect = view()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'All Courses' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Main' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith(1)
    await userEvent.tab()
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenLastCalledWith(2)
  })
  it('renders nothing when there is only one Course (a filter would say nothing)', () => {
    const { container } = render(<CourseFilter courses={courseChoices.slice(0, 1)} selected={null} onSelect={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
