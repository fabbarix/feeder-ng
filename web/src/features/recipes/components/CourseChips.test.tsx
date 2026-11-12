// CRS E2: the Course chips of a Recipe tile and of the Recipe detail.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CourseChips } from './CourseChips'

describe('CourseChips', () => {
  it('lists the Courses as chips in a list named "Courses"', () => {
    render(<CourseChips names={['Main', 'Side']} />)
    const list = screen.getByRole('list', { name: 'Courses' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Main', 'Side'])
  })
  it('adds the Whole meal chip last when asked', () => {
    render(<CourseChips names={['Main']} wholeMeal />)
    const items = within(screen.getByRole('list', { name: 'Courses' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['Main', 'Whole meal'])
  })
  it('has no Whole meal chip by default', () => {
    render(<CourseChips names={['Main']} />)
    expect(screen.queryByText('Whole meal')).toBeNull()
  })
  it('is not interactive: no button, no link', () => {
    render(<CourseChips names={['Main', 'Side']} wholeMeal />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
  it('renders nothing for no Courses', () => {
    const { container } = render(<CourseChips names={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
