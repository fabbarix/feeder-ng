// CRS E2: the confirm before a save that takes a Course off and removes Slot Rules (keyboard and ARIA).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CourseLoss } from '../types'
import { CourseLossDialog } from './CourseLossDialog'

const one: CourseLoss = { courseNames: ['Side'], rules: [{ id: 10, label: 'Friday Dinner · Side = rice' }] }
const many: CourseLoss = {
  courseNames: ['Side', 'Dessert'],
  rules: [{ id: 10, label: 'Friday Dinner · Side = rice' }, { id: 12, label: 'Sunday Lunch · Dessert = rice' }],
}
const view = (loss = one, open = true) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<CourseLossDialog open={open} loss={loss} onConfirm={onConfirm} onCancel={onCancel} />)
  return { onConfirm, onCancel }
}

describe('CourseLossDialog', () => {
  it('is a modal dialog named by what it removes, and lists the Slot Rule', () => {
    view()
    const dialog = screen.getByRole('dialog', { name: 'Taking Side off removes a Slot Rule' })
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('Friday Dinner · Side = rice')
  })
  it('names every Course and rule when there are several', () => {
    view(many)
    const dialog = screen.getByRole('dialog', { name: 'Taking Side and Dessert off removes 2 Slot Rules' })
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Friday Dinner · Side = rice',
      'Sunday Lunch · Dessert = rice',
    ])
  })
  it('confirms with "Save and remove" and cancels with Cancel', async () => {
    const { onConfirm, onCancel } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Save and remove' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it('Escape cancels', async () => {
    const { onCancel, onConfirm } = view()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('puts the first focus on Cancel (a removal is not the default)', () => {
    view()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })
  it('renders nothing while closed', () => {
    view(one, false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('uses no native confirm', () => {
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('window.confirm is native UI')
    })
    view()
    expect(confirm).not.toHaveBeenCalled()
  })
})
