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
  it('is a group named "Filter by Course" with one toggle chip per Course in household order, and no All Courses chip', () => {
    view()
    const group = screen.getByRole('group', { name: 'Filter by Course' })
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Main', 'Side', 'Starter', 'Dessert'])
  })
  it('presses no chip when no Course is selected (every Recipe shows)', () => {
    view(null)
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
  })
  it('presses the selected Course only', () => {
    view(2)
    expect(screen.getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('chooses another Course with a click', async () => {
    const onSelect = view(2)
    await userEvent.click(screen.getByRole('button', { name: 'Dessert' }))
    expect(onSelect).toHaveBeenLastCalledWith(4)
  })
  it('pressing the selected Course again clears the filter', async () => {
    const onSelect = view(2)
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
  it('works from the keyboard: every chip is a tab stop and Space and Enter choose', async () => {
    const onSelect = view()
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
