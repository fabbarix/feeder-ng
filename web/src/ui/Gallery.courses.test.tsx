import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gallery } from './Gallery'

describe('Gallery: Course primitives (CRS D1)', () => {
  it.each(['light', 'dark'] as const)('has CoursePicker and CourseSelect sections in the %s scheme', (scheme) => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
    for (const name of ['CoursePicker', 'CourseSelect']) {
      expect(within(section).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('shows the ordered form with a row extra, the unordered form, the empty error and the disabled state', () => {
    render(<Gallery />)
    expect(screen.getAllByRole('list', { name: 'Courses in order' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Choose at least one Course').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('course-row-extra-sample').length).toBeGreaterThan(0)
  })
})
