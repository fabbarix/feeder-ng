// SlotCoursesField (CRS D2): the shared Course picker with, per chosen Course, the Optional switch and "Who eats it".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SlotCourseInput } from '../types'
import { choices } from './courseFixtures'
import { members, tuesdayDinner } from './fixtures'
import { SlotCoursesField, type SlotCoursesFieldProps } from './SlotCoursesField'

const main: SlotCourseInput = { id: 1, optional: false, optOutMemberIds: [] }
const side: SlotCourseInput = { id: 2, optional: false, optOutMemberIds: [] }
const dessert: SlotCourseInput = { id: 4, optional: true, optOutMemberIds: [3] }

let latest: SlotCourseInput[] = []
function Harness({ initial, onChange, ...rest }: { initial: SlotCourseInput[]; onChange?: (v: SlotCourseInput[]) => void } & Partial<SlotCoursesFieldProps>) {
  const [value, setValue] = useState(initial)
  latest = value
  return (
    <SlotCoursesField
      courses={choices}
      members={members}
      attendance={tuesdayDinner.attendance}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      {...rest}
    />
  )
}
const rows = () => within(screen.getByRole('list', { name: 'Courses in order' })).getAllByRole('listitem')
const rowOf = (name: string) => rows().find((r) => within(r).queryByTestId('course-name')?.textContent === name)!
const eaters = (name: string) => within(rowOf(name)).getByRole('group', { name: `Who eats ${name}` })

describe('SlotCoursesField: structure', () => {
  it('is the Courses picker: chips in household order, chosen rows in the slot\'s order', () => {
    render(<Harness initial={[main, side, dessert]} />)
    expect(screen.getByRole('group', { name: 'Courses' })).toBeInTheDocument()
    expect(rows().map((r) => within(r).getByTestId('course-name').textContent)).toEqual(['Main', 'Side', 'Dessert'])
  })

  it('every row has an Optional switch named after its Course, set from the value', () => {
    render(<Harness initial={[main, side, dessert]} />)
    expect(within(rowOf('Main')).getByRole('switch', { name: 'Optional: Main' })).toHaveAttribute('aria-checked', 'false')
    expect(within(rowOf('Dessert')).getByRole('switch', { name: 'Optional: Dessert' })).toHaveAttribute('aria-checked', 'true')
  })

  it('says once what Optional means', () => {
    render(<Harness initial={[main]} />)
    expect(screen.getByText("Planned only when a Recipe fits without coming round too soon; otherwise left out, with no Couldn't plan")).toBeInTheDocument()
  })

  it('every row has "Who eats it" with a pill per attending Member, off for an opt-out', () => {
    render(<Harness initial={[main, dessert]} />)
    const pills = within(eaters('Dessert')).getAllByRole('button')
    expect(pills.map((b) => [b.getAttribute('aria-label') ?? b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Anna', 'true'], ['Marco', 'true'], ['Sam', 'false']])
    expect(within(rowOf('Dessert')).getByText('Sam does not eat it')).toBeInTheDocument()
    expect(within(rowOf('Main')).getAllByText('Who eats it').length).toBeGreaterThan(0)
  })

  it('offers only the Members who attend the slot', () => {
    render(<Harness initial={[main]} attendance={[{ memberId: 1, portionFactorOverride: null }, { memberId: 3, portionFactorOverride: null }]} />)
    expect(within(eaters('Main')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Anna', 'Sam'])
  })

  it('asks to choose who attends first when nobody does', () => {
    render(<Harness initial={[main]} attendance={[]} />)
    expect(within(rowOf('Main')).queryByRole('group', { name: 'Who eats Main' })).toBeNull()
    expect(within(rowOf('Main')).getByText('Choose who attends first.')).toBeInTheDocument()
  })

  it('uses no native control', () => {
    render(<Harness initial={[main, side]} />)
    expect(document.querySelector('select, input')).toBeNull()
  })
})

describe('SlotCoursesField: editing', () => {
  it('choosing a Course adds it last, required, with nobody opting out', async () => {
    const onChange = vi.fn()
    render(<Harness initial={[main]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dessert' }))
    expect(onChange).toHaveBeenLastCalledWith([main, { id: 4, optional: false, optOutMemberIds: [] }])
  })

  it('Remove takes the Course and its settings off', async () => {
    render(<Harness initial={[main, side, dessert]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Dessert' }))
    expect(latest).toEqual([main, side])
    await userEvent.click(screen.getByRole('button', { name: 'Dessert' }))
    expect(latest[2]).toEqual({ id: 4, optional: false, optOutMemberIds: [] })
  })

  it('the Optional switch sets only that Course', async () => {
    render(<Harness initial={[main, side]} />)
    await userEvent.click(within(rowOf('Side')).getByRole('switch', { name: 'Optional: Side' }))
    expect(latest).toEqual([main, { ...side, optional: true }])
  })

  it('a pill adds or removes the Member\'s opt-out for that Course only', async () => {
    render(<Harness initial={[main, side]} />)
    await userEvent.click(within(eaters('Side')).getByRole('button', { name: 'Marco' }))
    expect(latest).toEqual([main, { ...side, optOutMemberIds: [2] }])
    expect(within(rowOf('Side')).getByText('Marco does not eat it')).toBeInTheDocument()
    await userEvent.click(within(eaters('Side')).getByRole('button', { name: 'Marco' }))
    expect(latest).toEqual([main, side])
  })

  it('keeps the opt-outs of a Member who does not attend, though no pill shows', () => {
    render(<Harness initial={[{ ...main, optOutMemberIds: [3] }]} attendance={[{ memberId: 1, portionFactorOverride: null }]} />)
    expect(screen.queryByText(/Sam does not eat it/)).toBeNull()
    expect(latest).toEqual([{ ...main, optOutMemberIds: [3] }])
  })

  it('moving a row keeps its Optional switch and its pills with the Course', async () => {
    render(<Harness initial={[main, side, dessert]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move Dessert up' }))
    expect(rows().map((r) => within(r).getByTestId('course-name').textContent)).toEqual(['Main', 'Dessert', 'Side'])
    expect(within(rowOf('Dessert')).getByRole('switch', { name: 'Optional: Dessert' })).toHaveAttribute('aria-checked', 'true')
    expect(within(eaters('Dessert')).getByRole('button', { name: 'Sam' })).toHaveAttribute('aria-pressed', 'false')
    expect(latest).toEqual([main, dessert, side])
  })

  it('shows the error it is given, once', () => {
    render(<Harness initial={[{ ...main, optional: true }]} error="Keep at least one Course that is not optional" />)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Keep at least one Course that is not optional')
  })

  it('emptying the list shows the picker\'s own "Choose at least one Course"', async () => {
    render(<Harness initial={[main]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Main' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one Course')
  })

  it('disabled: every control of every row is disabled', () => {
    render(<Harness initial={[main, dessert]} disabled />)
    for (const c of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) expect(c).toBeDisabled()
  })
})

describe('SlotCoursesField: keyboard', () => {
  it('a row is operated in the order handle, Optional, the pills, then Move down (Move up is disabled on the first row)', async () => {
    render(<Harness initial={[main, side]} />)
    // The chips come first; step to the first row's handle.
    screen.getByRole('button', { name: 'Reorder Main' }).focus()
    await userEvent.tab()
    expect(screen.getByRole('switch', { name: 'Optional: Main' })).toHaveFocus()
    for (const name of ['Anna', 'Marco', 'Sam']) {
      await userEvent.tab()
      expect(within(eaters('Main')).getByRole('button', { name })).toHaveFocus()
    }
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Move Main down' })).toHaveFocus()
  })

  it('Space on the Optional switch and on a pill changes the value', async () => {
    render(<Harness initial={[main]} />)
    screen.getByRole('switch', { name: 'Optional: Main' }).focus()
    await userEvent.keyboard(' ')
    expect(latest[0]!.optional).toBe(true)
    within(eaters('Main')).getByRole('button', { name: 'Anna' }).focus()
    await userEvent.keyboard(' ')
    expect(latest[0]!.optOutMemberIds).toEqual([1])
  })
})

// SET-09: one anatomy for every chosen Course. [handle] [name / meta] [up down remove] over [Optional switch] [Who eats it pills].
describe('SlotCoursesField: the row anatomy (SET-09)', () => {
  it('the second line of a row reads "main Course" for the main Course, and who does not eat a Course in words', () => {
    render(<Harness initial={[main, side, dessert]} />)
    const meta = (name: string) => rowOf(name).querySelector('.course-picker__meta')?.textContent ?? null
    expect(meta('Main')).toBe('main Course')
    expect(meta('Side')).toBeNull()
    expect(meta('Dessert')).toBe('Sam does not eat it')
  })
  it('a main Course nobody opts out of keeps just "main Course"; one with an opt-out joins both with a dot', () => {
    render(<Harness initial={[{ ...main, optOutMemberIds: [2] }, side]} />)
    expect(rowOf('Main').querySelector('.course-picker__meta')?.textContent).toBe('main Course \u00b7 Marco does not eat it')
  })
  it('says it once: the pills\' own "Course \u00b7 without Name" summary is not repeated under the pills', () => {
    render(<Harness initial={[main, dessert]} />)
    expect(screen.queryByText(/Dessert \u00b7 without/)).toBeNull()
  })
  it('the up, down and remove buttons sit together in one IconSet at the end of the row, in a fixed order, a disabled one keeping its place', () => {
    render(<Harness initial={[main, side]} />)
    const set = rowOf('Main').querySelector('.icon-set') as HTMLElement
    expect(set).not.toBeNull()
    expect(within(set).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Move Main up', 'Move Main down', 'Remove Main'])
    expect(within(set).getByRole('button', { name: 'Move Main up' })).toBeDisabled()
    const last = rowOf('Side').querySelector('.icon-set') as HTMLElement
    expect(within(last).getByRole('button', { name: 'Move Side down' })).toBeDisabled()
    expect(within(last).getAllByRole('button')).toHaveLength(3)
  })
  it('the row\'s own children are the text block, the extras (Optional, Who eats it) and the IconSet; the DOM order is handle, text, extras, actions', () => {
    render(<Harness initial={[main]} />)
    const row = rowOf('Main')
    const order = [...row.children].map((c) => c.className.split(' ')[0])
    expect(order.indexOf('course-picker__text')).toBeGreaterThan(order.indexOf('sortable-handle'))
    expect(order.indexOf('course-picker__extras')).toBeGreaterThan(order.indexOf('course-picker__text'))
    expect(order.indexOf('course-picker__actions')).toBeGreaterThan(order.indexOf('course-picker__extras'))
  })
  it('the Switch is named "Optional: <Course>" and the pills\' group "Who eats <Course>"', () => {
    render(<Harness initial={[main, side]} />)
    expect(within(rowOf('Side')).getByRole('switch', { name: 'Optional: Side' })).toBeInTheDocument()
    expect(within(rowOf('Side')).getByRole('group', { name: 'Who eats Side' })).toBeInTheDocument()
  })
})
