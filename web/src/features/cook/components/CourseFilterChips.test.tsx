// CRS F (spec 11): "All · Main · Side" filter chips, built from the shared Chip.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CourseFilterChips } from './CourseFilterChips'

const chips = [{ id: 'all' as const, label: 'All' }, { id: 1, label: 'Main' }, { id: 2, label: 'Side' }]

describe('CourseFilterChips', () => {
  it('is a group named Courses of filter chips; exactly the selected one is pressed', () => {
    render(<CourseFilterChips chips={chips} selected={2} onSelect={() => {}} />)
    const group = screen.getByRole('group', { name: 'Courses' })
    const buttons = [...group.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['All', 'Main', 'Side'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(buttons.every((b) => b.closest('.chip')?.getAttribute('data-kind') === 'filter')).toBe(true)
  })

  it('choosing a chip reports its id', async () => {
    const onSelect = vi.fn()
    render(<CourseFilterChips chips={chips} selected="all" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onSelect.mock.calls).toEqual([[2], ['all']])
  })

  it('the keyboard reaches every chip in order and Enter or Space chooses', async () => {
    const onSelect = vi.fn()
    render(<CourseFilterChips chips={chips} selected="all" onSelect={onSelect} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'All' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Main' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    await userEvent.keyboard(' ')
    expect(onSelect.mock.calls).toEqual([[1], [2]])
  })

  it('renders nothing without chips', () => {
    const { container } = render(<CourseFilterChips chips={[]} selected="all" onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
