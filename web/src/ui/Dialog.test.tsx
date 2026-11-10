import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

function Harness(props: { dismissOnBackdrop?: boolean; withActions?: boolean; empty?: boolean; useRefFocus?: boolean }) {
  const [open, setOpen] = useState(false)
  const second = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete Chicken tikka traybake?"
        dismissOnBackdrop={props.dismissOnBackdrop}
        initialFocusRef={props.useRefFocus ? second : undefined}
        actions={
          props.withActions ? (
            <>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button ref={second}>Delete</button>
            </>
          ) : undefined
        }
      >
        {props.empty ? null : <p>It is removed from future Planned Meals.</p>}
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Dialog open={false} onClose={() => {}} title="T" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal <dialog> labelled by an h2 title, with its body', () => {
    render(<Dialog open onClose={() => {}} title="Delete Chicken tikka traybake?">Body text</Dialog>)
    const dialog = screen.getByRole('dialog', { name: 'Delete Chicken tikka traybake?' })
    expect(dialog.tagName).toBe('DIALOG')
    expect((dialog as HTMLDialogElement).open).toBe(true)
    expect(screen.getByRole('heading', { level: 2, name: 'Delete Chicken tikka traybake?' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Body text')
  })

  it('draws a status icon circle only when asked, and carries the tone', () => {
    const { rerender } = render(<Dialog open onClose={() => {}} title="T" />)
    expect(document.querySelector('.dialog__icon')).toBeNull()
    rerender(<Dialog open onClose={() => {}} title="T" icon="delete" tone="danger" />)
    expect(document.querySelector('.dialog__icon')).not.toBeNull()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tone', 'danger')
  })

  it('is a primary-button scope (one primary action per dialog)', () => {
    render(<Dialog open onClose={() => {}} title="T" />)
    expect(screen.getByRole('dialog')).toHaveAttribute('data-primary-scope')
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="T">x</Dialog>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click (a click whose target is the <dialog> itself) but not on content clicks', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="T"><p>inside</p></Dialog>)
    fireEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores the backdrop when dismissOnBackdrop is false, but Escape still closes', async () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="T" dismissOnBackdrop={false}>x</Dialog>)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('focuses the first focusable element on open', async () => {
    render(<Harness withActions />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('focuses initialFocusRef when given', async () => {
    render(<Harness withActions useRefFocus />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('focuses the title (not the dialog box) when nothing inside is focusable', async () => {
    render(<Harness empty />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveFocus()
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
  })

  it('returns focus to the trigger when closed by Escape', async () => {
    render(<Harness withActions />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the trigger when closed from inside', async () => {
    render(<Harness withActions />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(trigger).toHaveFocus()
  })
})
