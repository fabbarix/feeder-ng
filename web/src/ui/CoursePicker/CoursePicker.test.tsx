// CoursePicker (CRS D1): ordered and unordered forms, keyboard and ARIA, add, remove, reorder, the main Course marker,
// at least one required, and the per-row extras slot D2 fills with "Optional" and attendance.
// See docs/dev/design/crs-d1.md.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CourseChoice } from '../../lib/courses'
import { CoursePicker, type CoursePickerProps } from './CoursePicker'

// Household order: Main, Side, Starter, Dessert.
const courses: CourseChoice[] = [
  { id: 1, name: 'Main', main: true },
  { id: 2, name: 'Side', main: false },
  { id: 3, name: 'Starter', main: false },
  { id: 4, name: 'Dessert', main: false },
]

function Controlled({ initial, onChange, ...rest }: Partial<CoursePickerProps> & { initial: number[] }) {
  const [value, setValue] = useState(initial)
  return (
    <CoursePicker
      label="Courses"
      courses={courses}
      {...rest}
      value={value}
      onChange={(ids) => {
        setValue(ids)
        onChange?.(ids)
      }}
    />
  )
}

const chip = (name: string) => screen.getByRole('button', { name })
const rows = () => within(screen.getByRole('list', { name: 'Courses in order' })).getAllByRole('listitem')
const rowNames = () => rows().map((r) => within(r).getByTestId('course-name').textContent)
const liveText = () =>
  screen
    .getAllByRole('status')
    .map((s) => s.textContent)
    .join(' ')

describe('CoursePicker: toggle chips', () => {
  it('is a group named by its label with one toggle chip per Course, in household order', () => {
    render(<Controlled initial={[1]} ordered={false} />)
    const group = screen.getByRole('group', { name: 'Courses' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Main', 'Side', 'Starter', 'Dessert'])
  })

  it('shows chosen Courses as pressed', () => {
    render(<Controlled initial={[2, 1]} />)
    expect(chip('Main')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Side')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Starter')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the main Course for assistive tech (not by colour alone)', () => {
    render(<Controlled initial={[1]} />)
    expect(chip('Main')).toHaveAccessibleDescription(/main Course/)
    expect(chip('Side')).not.toHaveAccessibleDescription(/main Course/)
  })

  it('marks the flagged Course, not the one named "Main": the flag decides', () => {
    const renamed = courses.map((c) => (c.id === 2 ? { ...c, main: true } : { ...c, main: false }))
    render(<CoursePicker label="Courses" courses={renamed} value={[2]} onChange={() => {}} />)
    expect(chip('Side')).toHaveAccessibleDescription(/main Course/)
    expect(chip('Main')).not.toHaveAccessibleDescription(/main Course/)
  })

  it('Space and Enter toggle the focused chip; every chip is a tab stop', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1]} ordered={false} onChange={onChange} />)
    await userEvent.tab()
    expect(chip('Main')).toHaveFocus()
    await userEvent.tab()
    expect(chip('Side')).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith([1, 2])
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith([1])
  })

  it('disabled: every control is disabled and nothing changes', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1, 2]} disabled onChange={onChange} />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    await userEvent.click(chip('Starter'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('CoursePicker: ordered form', () => {
  it('lists the chosen Courses in the slot\'s order, not the household\'s', () => {
    render(<Controlled initial={[2, 1]} />)
    expect(rowNames()).toEqual(['Side', 'Main'])
  })

  it('is an ordered list', () => {
    render(<Controlled initial={[1]} />)
    expect(screen.getByRole('list', { name: 'Courses in order' }).tagName).toBe('OL')
  })

  it('adds a Course last, whatever its household position', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[2, 1]} onChange={onChange} />)
    await userEvent.click(chip('Starter'))
    expect(onChange).toHaveBeenLastCalledWith([2, 1, 3])
    expect(rowNames()).toEqual(['Side', 'Main', 'Starter'])
  })

  it('removes a Course by its chip and by its Remove button', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1, 2, 3]} onChange={onChange} />)
    await userEvent.click(chip('Side'))
    expect(onChange).toHaveBeenLastCalledWith([1, 3])
    await userEvent.click(screen.getByRole('button', { name: 'Remove Starter' }))
    expect(onChange).toHaveBeenLastCalledWith([1])
    expect(rowNames()).toEqual(['Main'])
  })

  it('the main Course is not required: it can be taken off', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1, 2]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Main' }))
    expect(onChange).toHaveBeenLastCalledWith([2])
  })

  it('marks the main Course on its row with text', () => {
    render(<Controlled initial={[2, 1]} />)
    expect(within(rows()[1]!).getByText('main Course')).toBeInTheDocument()
    expect(within(rows()[0]!).queryByText('main Course')).toBeNull()
  })

  it('ignores ids that are not in the list (archived or unknown) and drops them on the next change', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[99, 1]} onChange={onChange} />)
    expect(rowNames()).toEqual(['Main'])
    await userEvent.click(chip('Side'))
    expect(onChange).toHaveBeenLastCalledWith([1, 2])
  })
})

describe('CoursePicker: moving', () => {
  it('Move up and Move down buttons are named after the Course and reorder it', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1, 2, 3]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move Side up' }))
    expect(onChange).toHaveBeenLastCalledWith([2, 1, 3])
    await userEvent.click(screen.getByRole('button', { name: 'Move Main down' }))
    expect(onChange).toHaveBeenLastCalledWith([2, 3, 1])
    expect(rowNames()).toEqual(['Side', 'Starter', 'Main'])
  })

  it('the first row cannot move up and the last cannot move down', () => {
    render(<Controlled initial={[1, 2, 3]} />)
    expect(screen.getByRole('button', { name: 'Move Main up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Starter down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Side up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move Side down' })).toBeEnabled()
  })

  it('announces a move in a polite live region', async () => {
    render(<Controlled initial={[1, 2, 3]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move Side up' }))
    expect(liveText()).toContain('Side moved to position 1 of 3.')
  })

  it('keeps keyboard focus on the button that was used, so it can be pressed again', async () => {
    render(<Controlled initial={[1, 2, 3]} />)
    const up = screen.getByRole('button', { name: 'Move Starter up' })
    up.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Move Starter up' })).toHaveFocus()
  })

  it('has a drag handle per row (the shared Sortable) that moves with the keyboard', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1, 2, 3]} onChange={onChange} />)
    const handle = screen.getByRole('button', { name: 'Reorder Side' })
    expect(handle).toHaveAccessibleDescription(/Press Space to pick up/)
    handle.focus()
    await userEvent.keyboard(' {ArrowUp} ')
    expect(onChange).toHaveBeenLastCalledWith([2, 1, 3])
  })

  it('the unordered form has no list, handles or Move buttons', () => {
    render(<Controlled initial={[1, 2]} ordered={false} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Move|Reorder|Remove)/ })).toBeNull()
  })
})

describe('CoursePicker: unordered form', () => {
  it('answers in household order whatever the order of picking', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[4]} ordered={false} onChange={onChange} />)
    await userEvent.click(chip('Main'))
    expect(onChange).toHaveBeenLastCalledWith([1, 4])
    await userEvent.click(chip('Side'))
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 4])
  })

  it('takes a Course off', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={[1, 2]} ordered={false} onChange={onChange} />)
    await userEvent.click(chip('Main'))
    expect(onChange).toHaveBeenLastCalledWith([2])
  })
})

describe('CoursePicker: at least one Course', () => {
  it('shows "Choose at least one Course" as an alert while nothing is chosen, and links it with the group', () => {
    render(<Controlled initial={[]} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Choose at least one Course')
    expect(screen.getByRole('group', { name: 'Courses' })).toHaveAccessibleDescription(/Choose at least one Course/)
  })

  it('shows no message while one is chosen, and it goes away on the first pick', async () => {
    render(<Controlled initial={[]} />)
    await userEvent.click(chip('Main'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows it again after the last Course is taken off', async () => {
    render(<Controlled initial={[2]} />)
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Side' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one Course')
  })

  it('works the same in the unordered form', async () => {
    render(<Controlled initial={[2]} ordered={false} />)
    await userEvent.click(chip('Side'))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one Course')
  })

  it('required={false} allows an empty choice without a message', () => {
    render(<Controlled initial={[]} required={false} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a given error replaces the built-in message', () => {
    render(<Controlled initial={[]} error="Pick the Courses this slot serves" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Pick the Courses this slot serves')
    expect(screen.queryByText('Choose at least one Course')).toBeNull()
  })

  it('shows the helper and links it with the group', () => {
    render(<Controlled initial={[1]} helper="Drag to set the order." />)
    expect(screen.getByRole('group', { name: 'Courses' })).toHaveAccessibleDescription(/Drag to set the order\./)
  })
})

describe('CoursePicker: row extras (the slot D2 fills)', () => {
  it('renders the extras inside each chosen row, in the slot\'s order, with the Course, index and count', () => {
    const renderRowExtras = vi.fn((row) => <span data-testid="extra">{`${row.course.name}:${row.index}/${row.count}`}</span>)
    render(<Controlled initial={[2, 1]} renderRowExtras={renderRowExtras} />)
    const items = rows()
    expect(within(items[0]!).getByTestId('extra')).toHaveTextContent('Side:0/2')
    expect(within(items[1]!).getByTestId('extra')).toHaveTextContent('Main:1/2')
  })

  it('puts the extras between the name and the Move buttons in tab order', async () => {
    render(<Controlled initial={[1, 2]} renderRowExtras={() => <button type="button">Extra</button>} />)
    const first = rows()[0]!
    within(first).getByRole('button', { name: 'Reorder Main' }).focus()
    await userEvent.tab()
    expect(within(first).getByRole('button', { name: 'Extra' })).toHaveFocus()
    await userEvent.tab()
    expect(within(first).getByRole('button', { name: 'Move Main up' })).toHaveFocus()
  })

  it('is not called by the unordered form', () => {
    const renderRowExtras = vi.fn(() => <span />)
    render(<Controlled initial={[1, 2]} ordered={false} renderRowExtras={renderRowExtras} />)
    expect(renderRowExtras).not.toHaveBeenCalled()
  })

  it('is not called for a Course that is not chosen', () => {
    const renderRowExtras = vi.fn(() => <span />)
    render(<Controlled initial={[3]} renderRowExtras={renderRowExtras} />)
    expect(renderRowExtras).toHaveBeenCalledTimes(1)
  })
})

describe('CoursePicker: native-free', () => {
  it('uses no native form control and no draggable attribute', () => {
    const { container } = render(<Controlled initial={[1, 2]} />)
    expect(container.querySelector('select, input, [draggable]')).toBeNull()
  })

  it('shows decorative icons only', () => {
    const { container } = render(<Controlled initial={[1, 2]} />)
    for (const svg of container.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
