// Batch w3e (B9-34 Take back): a toast raised while a modal sheet stays open shows inside that sheet's <dialog> (the top layer), so
// it is seen and its Undo reachable. A plain toast (no action) stays in the page, as does any toast with no modal open.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { ToastProvider } from './Toast'
import { Fire, toasts } from './Toast.test-helper'

describe('the toast region and an open modal sheet', () => {
  it('a plain toast stays in the page even with a modal open', async () => {
    render(
      <ToastProvider>
        <BottomSheet open onClose={() => {}} title="Carrot">
          <Fire arg="plain" name="plain" />
        </BottomSheet>
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'plain' }))
    await waitFor(() => expect(toasts()).toHaveLength(1))
    expect(toasts()[0]!.closest('dialog')).toBeNull()
  })

  it('a toast with an action lives inside the open modal dialog, and back in the page when it closes', async () => {
    const view = (open: boolean) => (
      <ToastProvider>
        <BottomSheet open={open} onClose={() => {}} title="Carrot">
          <Fire arg={{ title: 'Your 50 g of Carrot was taken back from Stock', actions: [{ label: 'Undo', onClick: () => {} }] }} />
          <Fire arg="plain" name="plain" />
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

describe('Toast.css: inside a bottom sheet', () => {
  it('the region sits at the top of the screen, over the scrim, not over the sheet', async () => {
    const { stylesheet, rule } = await import('../test/cssRules')
    expect(rule(stylesheet('src/ui/Toast.css').base, 'dialog.sheet > .toast-region')).toMatchObject({ 'inset-block-end': 'auto' })
  })
})
