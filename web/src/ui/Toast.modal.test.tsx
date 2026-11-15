// Batch w3e (B9-34 Take back): a toast raised while a modal sheet stays open shows inside that sheet's <dialog> (the top layer), so
// it is seen and its Undo reachable; with no modal open it stays in the page.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { ToastProvider } from './Toast'
import { Fire, toasts } from './Toast.test-helper'

describe('the toast region and an open modal sheet', () => {
  it('lives inside the open modal dialog while it is open, and back in the page when it closes', async () => {
    const view = (open: boolean) => (
      <ToastProvider>
        <BottomSheet open={open} onClose={() => {}} title="Carrot">
          <Fire arg="Your 50 g of Carrot was taken back from Stock" />
        </BottomSheet>
        <Fire arg="page toast" name="page" />
      </ToastProvider>
    )
    const { rerender } = render(view(true))
    await userEvent.click(screen.getByRole('button', { name: 'fire' }))
    await waitFor(() => expect(toasts()).toHaveLength(1))
    expect(toasts()[0]!.closest('dialog')).not.toBeNull()
    act(() => rerender(view(false)))
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull())
    await waitFor(() => expect(document.querySelector('.toast-region')!.closest('dialog')).toBeNull())
  })
})
