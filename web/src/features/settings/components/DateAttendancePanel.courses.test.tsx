// CRS D2: the Courses section of the Date Attendance sheet ("Sam is away Thursday", and "no Dessert for Marco on this date").
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { DateAttendance } from '../types'
import { dateWithCourses, thursdayDinnerCourses, thursdayWithDessert } from './courseFixtures'
import { DateAttendancePanel } from './DateAttendancePanel'
import { members, thursdayDinner } from './fixtures'

function setup(over: Partial<React.ComponentProps<typeof DateAttendancePanel>> = {}) {
  const props = {
    open: true, slot: thursdayWithDessert, date: '2026-11-12', attendance: dateWithCourses, members,
    onChangeDate: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...over,
  }
  render(<DateAttendancePanel {...props} />)
  return { ...props, onSave: props.onSave as unknown as Mock }
}
const section = () => screen.getByRole('region', { name: 'Courses' })
const eaters = (course: string) => within(screen.getByRole('group', { name: `Who eats ${course} on this date` }))
const pill = (course: string, name: string) => eaters(course).getByRole('button', { name })
const overrideOf = (id: number, optOut: number[]): DateAttendance => ({
  ...dateWithCourses,
  courses: dateWithCourses.courses!.map((c) => (c.courseId === id ? { ...c, optOutMemberIds: optOut, isOverride: true } : c)),
})

describe('Courses section: what it shows', () => {
  it('has one group per Course of the slot, in its order, over that date\'s Attendance', () => {
    setup()
    expect(within(section()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Who eats Main on this date', 'Who eats Side on this date', 'Who eats Dessert on this date'])
    expect(eaters('Dessert').getAllByRole('button').map((b) => [b.getAttribute('aria-label') ?? b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Anna', 'true'], ['Marco', 'true'], ['Sam', 'false'],
    ])
    expect(screen.getByText('Dessert · without Sam')).toBeInTheDocument()
  })

  it('is absent when the slot serves one Course, or the date carries no Courses', () => {
    setup({ slot: thursdayDinnerCourses, attendance: { ...dateWithCourses, courses: dateWithCourses.courses!.slice(0, 1) } })
    expect(screen.queryByRole('region', { name: 'Courses' })).toBeNull()
  })

  it('is absent for an answer without Courses (an older server)', () => {
    setup({ attendance: { ...dateWithCourses, courses: undefined } })
    expect(screen.queryByRole('region', { name: 'Courses' })).toBeNull()
  })

  it('offers only the Members who attend on this date: taking Sam off the date takes his pills away', async () => {
    setup()
    expect(within(section()).getAllByRole('button', { name: 'Sam' })).toHaveLength(3)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    expect(within(section()).queryByRole('button', { name: 'Sam' })).toBeNull()
  })
})

describe('Courses section: saving', () => {
  it('a pill changed saves that Course alone and leaves the date\'s Attendance as it is (attendance undefined)', async () => {
    const { onSave } = setup()
    await userEvent.click(pill('Dessert', 'Marco'))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(undefined, [{ courseId: 4, optOutMemberIds: [3, 2] }])
  })

  it('a pill on a Course that follows the usual opt-outs makes it an override of the date', async () => {
    const { onSave } = setup()
    await userEvent.click(pill('Side', 'Anna'))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(undefined, [{ courseId: 2, optOutMemberIds: [1] }])
  })

  it('changing a pill and changing it back saves nothing for the Course', async () => {
    const { onSave } = setup()
    await userEvent.click(pill('Side', 'Anna'))
    await userEvent.click(pill('Side', 'Anna'))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(thursdayDinner.attendance)
    expect(onSave.mock.calls[0]).toHaveLength(1)
  })

  it('Attendance and Courses changed together are saved together', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' }))
    await userEvent.click(pill('Side', 'Anna'))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith([thursdayDinner.attendance[0], thursdayDinner.attendance[2]], [{ courseId: 2, optOutMemberIds: [1] }])
  })

  it('an Attendance change alone is saved exactly as before (one argument)', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave.mock.calls[0]).toEqual([thursdayDinner.attendance.slice(0, 2)])
  })
})

describe('Courses section: Reset to usual', () => {
  it('is disabled for a Course that follows the usual opt-outs', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Reset Side to usual' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset Dessert to usual' })).toBeDisabled()
  })

  it('on an overridden Course puts the usual opt-outs back and saves null for it', async () => {
    const { onSave } = setup({ attendance: overrideOf(4, [3, 2]) })
    expect(pill('Dessert', 'Marco')).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Dessert to usual' }))
    expect(pill('Dessert', 'Marco')).toHaveAttribute('aria-pressed', 'true')
    expect(pill('Dessert', 'Sam')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Reset Dessert to usual' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(undefined, [{ courseId: 4, optOutMemberIds: null }])
  })

  it('a Course override is enough to enable "Reset to usual Attendance" for the whole date', () => {
    setup({ attendance: overrideOf(4, [3, 2]) })
    expect(screen.getByRole('button', { name: 'Reset to usual Attendance' })).toBeEnabled()
  })

  it('without any override the whole-date reset stays disabled', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Reset to usual Attendance' })).toBeDisabled()
  })
})

describe('Courses section: keyboard', () => {
  it('the pills are reachable by Tab and toggle with Space', async () => {
    setup()
    pill('Side', 'Anna').focus()
    await userEvent.tab()
    expect(pill('Side', 'Marco')).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(pill('Side', 'Marco')).toHaveAttribute('aria-pressed', 'false')
  })
})
