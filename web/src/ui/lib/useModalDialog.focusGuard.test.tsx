// B9-14 / A11Y-07 "a sheet or dialog opens": while a MODAL dialog is open focus never rests on <body> or outside it. useModalDialog
// listens for `focusout` on the dialog (it bubbles): when the new focus target (relatedTarget) is null or outside the dialog, it
// checks on the next animation frame and, if focus is still not inside the dialog, runs `initialFocus(dialog)` again.
// Moves between two controls inside the dialog are left alone. A non-modal sheet (modal={false}) has no guard.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../BottomSheet'
import { Dialog } from '../Dialog'

afterEach(() => vi.useRealTimers())

const nextFrame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

function Remounting({ keyed }: { keyed: string }) {
  return (
    <BottomSheet open onClose={() => {}} title="Change a date">
      <button key={keyed}>Date {keyed}</button>
      <button>Other field</button>
    </BottomSheet>
  )
}

describe('useModalDialog focus guard (A11Y-07)', () => {
  it('when the focused child remounts and focus falls to <body>, focus returns inside the dialog on the next frame', async () => {
    const { rerender } = render(<Remounting keyed="1" />)
    const first = screen.getByRole('button', { name: 'Date 1' })
    expect(first).toHaveFocus() // opening: the first control of the body
    rerender(<Remounting keyed="2" />)
    expect(document.body).toHaveFocus() // the focused element was replaced
    const dialog = screen.getByRole('dialog')
    fireEvent.focusOut(dialog, { relatedTarget: null })
    await nextFrame()
    expect(screen.getByRole('button', { name: 'Date 2' })).toHaveFocus()
  })

  it('when focus is sent to an element outside the open modal, it comes back to the initial target', async () => {
    render(
      <>
        <button>Behind</button>
        <BottomSheet open onClose={() => {}} title="T">
          <button>Inside</button>
        </BottomSheet>
      </>,
    )
    const behind = screen.getByRole('button', { name: 'Behind', hidden: true })
    act(() => behind.focus())
    fireEvent.focusOut(screen.getByRole('dialog'), { relatedTarget: behind })
    await nextFrame()
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()
  })

  it('does not move focus between two controls of the dialog', async () => {
    render(
      <Dialog open onClose={() => {}} title="Name it">
        <input aria-label="A" />
        <input aria-label="B" />
      </Dialog>,
    )
    const b = screen.getByLabelText('B')
    act(() => b.focus())
    fireEvent.focusOut(screen.getByRole('dialog'), { relatedTarget: b })
    await nextFrame()
    expect(b).toHaveFocus()
  })

  it('works for a Dialog too, and re-runs the caller initialFocus (the first [data-autofocus])', async () => {
    function D({ keyed }: { keyed: string }) {
      return (
        <Dialog open onClose={() => {}} title="Sure?" actions={<button key={keyed} data-autofocus>Confirm {keyed}</button>}>
          text
        </Dialog>
      )
    }
    const { rerender } = render(<D keyed="1" />)
    rerender(<D keyed="2" />)
    fireEvent.focusOut(screen.getByRole('dialog'), { relatedTarget: null })
    await nextFrame()
    expect(screen.getByRole('button', { name: 'Confirm 2' })).toHaveFocus()
  })

  it('a non-modal sheet has no guard: focus that leaves it stays where the user put it', async () => {
    function Page() {
      const [open] = useState(true)
      return (
        <>
          <button>Page control</button>
          <BottomSheet open={open} onClose={() => {}} title="Keypad" modal={false}>
            <button>Key</button>
          </BottomSheet>
        </>
      )
    }
    render(<Page />)
    const page = screen.getByRole('button', { name: 'Page control' })
    act(() => page.focus())
    fireEvent.focusOut(document.querySelector('dialog')!, { relatedTarget: page })
    await nextFrame()
    expect(page).toHaveFocus()
  })
})
