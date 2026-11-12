// CourseRow (CRS D2): one row of Settings > Courses; keyboard and ARIA.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sortable } from '../../../ui'
import { brunchCourse, mainCourse, sideCourse } from './courseFixtures'
import { CourseRow, type CourseRowProps } from './CourseRow'

function setup(over: Partial<CourseRowProps> = {}) {
  const props: CourseRowProps = { course: sideCourse, canEdit: true, onAction: vi.fn(), ...over }
  render(
    <MemoryRouter>
      <ul>
        <CourseRow {...props} />
      </ul>
    </MemoryRouter>,
  )
  return props
}
const menu = (name: string) => screen.getByRole('button', { name: `Actions for ${name}` })

describe('CourseRow: reading', () => {
  it('shows the name and what uses the Course', () => {
    setup()
    const row = screen.getByRole('listitem')
    expect(within(row).getByTestId('course-name')).toHaveTextContent('Side')
    expect(within(row).getByText('8 Recipes · 3 Meal Slots')).toBeInTheDocument()
    expect(within(row).queryByTestId('course-main-chip')).toBeNull()
  })

  it('marks the main Course with a "Main" chip', () => {
    setup({ course: mainCourse })
    expect(screen.getByTestId('course-main-chip')).toHaveTextContent('Main')
  })

  it('a plain User gets no drag handle and no actions', () => {
    setup({ canEdit: false })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Side')).toBeInTheDocument()
  })

  it('with a Sortable context the row has the drag handle "Reorder Side" first', () => {
    render(
      <MemoryRouter>
        <Sortable
          items={[sideCourse]}
          getKey={(c) => String(c.id)}
          getLabel={(c) => c.name}
          onReorder={() => {}}
          renderItem={(c, ctx) => <CourseRow course={c} canEdit sortable={ctx} onAction={() => {}} />}
        />
      </MemoryRouter>,
    )
    const buttons = within(screen.getByRole('listitem')).getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Reorder Side')
    expect(buttons[1]).toHaveAccessibleName('Actions for Side')
  })
})

describe('CourseRow: actions menu', () => {
  it('offers Rename, Make main and Delete for a Course that is not main', async () => {
    const { onAction } = setup()
    await userEvent.click(menu('Side'))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Rename', 'Make main', 'Delete'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make main' }))
    expect(onAction).toHaveBeenCalledWith('makeMain')
  })

  it.each([['Rename', 'rename'], ['Delete', 'delete']])('%s asks for %s', async (label, id) => {
    const { onAction } = setup()
    await userEvent.click(menu('Side'))
    await userEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(onAction).toHaveBeenCalledWith(id)
  })

  it('the main Course cannot be deleted: its Delete reads "Make another Course main first" and does nothing', async () => {
    const { onAction } = setup({ course: mainCourse })
    await userEvent.click(menu('Main'))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Rename', 'Make another Course main first'])
    const blocked = screen.getByRole('menuitem', { name: 'Make another Course main first' })
    expect(blocked).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(blocked)
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('CourseRow: renaming', () => {
  const renaming = { value: 'Side' }

  it('replaces the name with a text field named "Rename Side" and Save / Cancel', () => {
    setup({ renaming })
    expect(screen.getByRole('textbox', { name: 'Rename Side' })).toHaveValue('Side')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('reports typing, Enter saves and Escape cancels', async () => {
    const onRenameChange = vi.fn()
    const onRenameSave = vi.fn()
    const onRenameCancel = vi.fn()
    setup({ renaming, onRenameChange, onRenameSave, onRenameCancel })
    const field = screen.getByRole('textbox', { name: 'Rename Side' })
    await userEvent.type(field, 's')
    expect(onRenameChange).toHaveBeenLastCalledWith('Sides')
    await userEvent.keyboard('{Enter}')
    expect(onRenameSave).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onRenameCancel).toHaveBeenCalledTimes(1)
  })

  it('puts the focus in the field when it opens', () => {
    setup({ renaming })
    expect(screen.getByRole('textbox', { name: 'Rename Side' })).toHaveFocus()
  })

  it('shows the problem as an alert tied to the field, and Save is disabled while busy', () => {
    setup({ renaming: { value: 'Main', error: 'There is already a Course with that name', busy: true } })
    expect(screen.getByRole('alert')).toHaveTextContent('There is already a Course with that name')
    expect(screen.getByRole('textbox', { name: 'Rename Side' })).toBeInvalid()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Cancel and Save call back', async () => {
    const onRenameSave = vi.fn()
    const onRenameCancel = vi.fn()
    setup({ renaming, onRenameSave, onRenameCancel })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onRenameSave).toHaveBeenCalled()
    expect(onRenameCancel).toHaveBeenCalled()
  })
})

describe('CourseRow: archived', () => {
  it('shows an Unarchive button named after the Course instead of the menu', async () => {
    const onUnarchive = vi.fn()
    setup({ course: brunchCourse, onUnarchive })
    expect(screen.queryByRole('button', { name: 'Actions for Brunch' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Brunch' }))
    expect(onUnarchive).toHaveBeenCalledTimes(1)
  })
})
