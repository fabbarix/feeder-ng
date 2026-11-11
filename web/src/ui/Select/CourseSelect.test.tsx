// CourseSelect and CourseMultiSelect (CRS D1): the shared Course selects built on Select and MultiSelect.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CourseChoice } from '../../lib/courses'
import { CourseMultiSelect, CourseSelect, courseOptions } from './CourseSelect'

// Household order: Main, Side, Starter, Dessert.
const courses: CourseChoice[] = [
  { id: 1, name: 'Main', main: true },
  { id: 2, name: 'Side', main: false },
  { id: 3, name: 'Starter', main: false },
  { id: 4, name: 'Dessert', main: false },
]
const open = (name: RegExp | string) => userEvent.click(screen.getByRole('combobox', { name }))
const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent ?? '')

describe('courseOptions', () => {
  it('keeps household order, numeric values and the name as label', () => {
    expect(courseOptions(courses).map((o) => [o.value, o.label])).toEqual([
      [1, 'Main'],
      [2, 'Side'],
      [3, 'Starter'],
      [4, 'Dessert'],
    ])
  })
  it('puts "main Course" as meta on the flagged Course only', () => {
    expect(courseOptions(courses).map((o) => o.meta)).toEqual(['main Course', undefined, undefined, undefined])
  })
  it('does not reorder or filter: the caller passes the Courses to offer', () => {
    expect(courseOptions([courses[2]!, courses[0]!]).map((o) => o.value)).toEqual([3, 1])
  })
})

describe('CourseSelect', () => {
  it('is a combobox; the list shows every Course in household order with the main Course marked', async () => {
    render(<CourseSelect label="Replacement Course" courses={courses} value={null} onChange={() => {}} />)
    await open('Replacement Course')
    expect(optionNames()).toEqual(['Mainmain Course', 'Side', 'Starter', 'Dessert'])
  })

  it('shows the chosen Course in the closed trigger', () => {
    render(<CourseSelect label="Course" courses={courses} value={2} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /Course/ })).toHaveTextContent('Side')
  })

  it('picks a Course and answers its id', async () => {
    const onChange = vi.fn()
    render(<CourseSelect label="Course" courses={courses} value={1} onChange={onChange} />)
    await open('Course')
    await userEvent.click(screen.getByRole('option', { name: /Starter/ }))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('works from the keyboard: ArrowDown, Enter', async () => {
    const onChange = vi.fn()
    render(<CourseSelect label="Course" courses={courses} value={null} onChange={onChange} />)
    screen.getByRole('combobox', { name: /Course/ }).focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('offers only the Courses it is given (a Meal Slot\'s Courses)', async () => {
    render(<CourseSelect label="Course" courses={[courses[0]!, courses[1]!]} value={1} onChange={() => {}} />)
    await open('Course')
    expect(optionNames()).toEqual(['Mainmain Course', 'Side'])
  })

  it('names the entity in its empty search copy: "No Course matches"', async () => {
    const many: CourseChoice[] = Array.from({ length: 9 }, (_, i) => ({ id: i + 10, name: `Course ${i}`, main: false }))
    render(<CourseSelect label="Course" courses={many} value={null} onChange={() => {}} />)
    await open('Course')
    await userEvent.keyboard('xyz')
    expect(screen.getByText("No Course matches 'xyz'")).toBeInTheDocument()
  })

  it('passes the field props on: helper and error', () => {
    render(<CourseSelect label="Course" courses={courses} value={null} onChange={() => {}} helper="Takes the Recipes that have only this Course." error="Choose a Course" />)
    expect(screen.getByText('Choose a Course')).toBeInTheDocument()
  })
})

describe('CourseMultiSelect', () => {
  function Multi({ initial = [], onChange }: { initial?: number[]; onChange?: (ids: number[]) => void }) {
    const [values, setValues] = useState(initial)
    return (
      <CourseMultiSelect
        label="Courses"
        courses={courses}
        values={values}
        onChange={(ids) => {
          setValues(ids)
          onChange?.(ids)
        }}
      />
    )
  }

  it('is a multiselectable listbox; picking toggles and the list stays open', async () => {
    const onChange = vi.fn()
    render(<Multi onChange={onChange} />)
    await open('Courses')
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true')
    await userEvent.click(screen.getByRole('option', { name: /Side/ }))
    expect(onChange).toHaveBeenLastCalledWith([2])
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /Side/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('answers in household order whatever the order of picking', async () => {
    const onChange = vi.fn()
    render(<Multi initial={[4]} onChange={onChange} />)
    await open('Courses')
    await userEvent.click(screen.getByRole('option', { name: /Main/ }))
    expect(onChange).toHaveBeenLastCalledWith([1, 4])
    await userEvent.click(screen.getByRole('option', { name: /Starter/ }))
    expect(onChange).toHaveBeenLastCalledWith([1, 3, 4])
  })

  it('summarises the selection in the trigger, in household order', () => {
    render(<Multi initial={[4, 1]} />)
    expect(screen.getByRole('combobox', { name: /Courses/ })).toHaveTextContent('Main, Dessert')
  })

  it('marks the selected options with aria-selected', async () => {
    render(<Multi initial={[2]} />)
    await open('Courses')
    expect(screen.getByRole('option', { name: /Side/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Starter/ })).toHaveAttribute('aria-selected', 'false')
  })
})
