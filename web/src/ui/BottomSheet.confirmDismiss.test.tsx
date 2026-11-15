// B9-14 / SAFE `confirmDismiss`: "Form sheets ask 'Discard changes?' (Keep editing / Discard changes) before any dismissal while dirty".
//   confirmDismiss?: boolean — the caller passes its dirty flag. While true, every dismissal (Escape, the scrim, the grip, Close, and
//   Cancel) opens a Dialog instead of closing: title "Discard changes?", Cancel-button "Keep editing" (focused) and a danger button
//   "Discard changes". Keep editing closes only the question; the sheet and its fields stay. Discard changes calls onClose (for
//   Cancel: onCancel). While false, dismissal is immediate, as before. A commit (Save) is never asked: the caller closes the sheet.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'

const sheet = (props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) => {
  const onClose = vi.fn()
  const onCancel = vi.fn()
  render(
    <BottomSheet open onClose={onClose} title="Add Member" {...props}>
      <input aria-label="Name" defaultValue="Sam" />
    </BottomSheet>,
  )
  return { onClose, onCancel }
}
const question = () => screen.queryByRole('dialog', { name: 'Discard changes?' })

describe('confirmDismiss (SAFE)', () => {
  it('while clean, every dismissal is immediate', async () => {
    const { onClose } = sheet({ confirmDismiss: false })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(question()).toBeNull()
  })

  it.each([
    ['Close', () => userEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['the scrim', () => fireEvent.click(screen.getAllByRole('dialog')[0]!)],
    ['Escape', () => fireEvent(screen.getAllByRole('dialog')[0]!, new Event('cancel', { cancelable: true }))],
  ])('while dirty, %s asks first and does not close', async (_name, dismiss) => {
    const { onClose } = sheet({ confirmDismiss: true })
    await dismiss()
    expect(onClose).not.toHaveBeenCalled()
    const q = question()!
    expect(q).toBeInTheDocument()
    expect(within(q).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
    expect(within(q).getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'danger')
  })

  it('Keep editing is focused, closes only the question, and leaves the sheet and its field as they were', async () => {
    const { onClose } = sheet({ confirmDismiss: true })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(question()).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('Sam')
    expect(screen.getByRole('dialog', { name: 'Add Member' })).toBeInTheDocument()
  })

  it('Escape on the question is Keep editing, not a discard', async () => {
    const { onClose } = sheet({ confirmDismiss: true })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent(question()!, new Event('cancel', { cancelable: true }))
    expect(question()).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Discard changes closes the sheet through onClose', async () => {
    const { onClose } = sheet({ confirmDismiss: true })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Cancel (R-B) asks too while dirty, and Discard changes then calls onCancel', async () => {
    const onCancel = vi.fn()
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} onCancel={onCancel} confirmDismiss title="Edit Meal Slot">
        body
      </BottomSheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('a clean sheet with Cancel leaves at once', async () => {
    const onCancel = vi.fn()
    render(
      <BottomSheet open onClose={() => {}} onCancel={onCancel} confirmDismiss={false} title="T">
        body
      </BottomSheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('the question is a real <dialog> (no native confirm), and focus returns to the sheet after Keep editing', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    sheet({ confirmDismiss: true })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(question()!.tagName).toBe('DIALOG')
    expect(confirmSpy).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('dialog', { name: 'Add Member' }).contains(document.activeElement)).toBe(true)
    confirmSpy.mockRestore()
  })
})
