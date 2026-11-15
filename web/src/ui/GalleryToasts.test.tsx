// B9-18 (main-session ruling 8): the Gallery shows every toast, Undo and confirm state of B9-18 without a harness.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ToastUndoGalleryGroup } from './GalleryToasts'

describe('Gallery: Toasts, Undo and confirms', () => {
  it('shows each toast state on its own stage at once', () => {
    render(<ToastUndoGalleryGroup />)
    const group = screen.getByRole('heading', { name: 'Toasts, Undo and confirms' }).closest('section')!
    const titles = [...group.querySelectorAll('.toast__title')].map((t) => t.textContent)
    expect(titles).toEqual(
      expect.arrayContaining(['Saved to the plan', 'Sam removed', 'Could not save', 'Sat Dinner marked Not cooked', 'Cooked, nice one!', 'Plan regenerated', 'Nothing was undone', 'A new version of Feeder is ready']),
    )
    const refused = [...group.querySelectorAll<HTMLElement>('.toast')].find((t) => t.querySelector('.toast__title')?.textContent === 'Nothing was undone')!
    expect(refused).toHaveAttribute('data-status', 'warning')
    const update = [...group.querySelectorAll<HTMLElement>('.toast')].find((t) => t.textContent?.includes('A new version'))!
    expect(update).toHaveAttribute('data-dismiss', 'none')
    expect(within(update).queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('opens the leave dialog and a confirm with groups', async () => {
    render(<ToastUndoGalleryGroup />)
    await userEvent.click(screen.getByRole('button', { name: 'Leave without saving?' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm with groups and a note' }))
    expect(await screen.findByRole('list', { name: 'Goes with Sam' })).toBeInTheDocument()
  })

  it('shows the DraftNotice with its icon', () => {
    render(<ToastUndoGalleryGroup />)
    expect(screen.getByRole('status', { name: 'Your unsaved changes are back' }).querySelector('svg')).not.toBeNull()
  })
})
