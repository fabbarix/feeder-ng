// New-API tests for the rebuilt BottomSheet (a <dialog>). The old BottomSheet block of Overlays.test.tsx is removed:
// its backdrop test-id no longer exists. BottomSheet.tsx itself is rewritten by the Developer after the WP3 sync.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'

function Harness({ body }: { body?: 'button' | 'text' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open sheet</button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Unknown barcode">
        {body === 'text' ? <p>Nothing to press</p> : <button>Add Product</button>}
      </BottomSheet>
    </>
  )
}

describe('BottomSheet (dialog)', () => {
  it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="T">body</BottomSheet>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal <dialog> named by its h2 title', () => {
    render(<BottomSheet open onClose={() => {}} title="Unknown barcode">body</BottomSheet>)
    const dialog = screen.getByRole('dialog', { name: 'Unknown barcode' })
    expect(dialog.tagName).toBe('DIALOG')
    expect((dialog as HTMLDialogElement).open).toBe(true)
    expect(screen.getByRole('heading', { level: 2, name: 'Unknown barcode' })).toBeInTheDocument()
  })

  it('has a close IconButton top-right that closes it', async () => {
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} title="T">body</BottomSheet>)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on a backdrop click, not on content clicks', async () => {
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} title="T"><p>inside</p></BottomSheet>)
    fireEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders a sticky footer outside the scrolling body', () => {
    render(<BottomSheet open onClose={() => {}} title="T" footer={<button>Save</button>}><p>scrolls</p></BottomSheet>)
    const footer = document.querySelector('.sheet__footer')
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(document.querySelector('.sheet__body')).not.toContainElement(screen.getByRole('button', { name: 'Save' }))
  })

  it('is a primary-button scope', () => {
    render(<BottomSheet open onClose={() => {}} title="T">x</BottomSheet>)
    expect(screen.getByRole('dialog')).toHaveAttribute('data-primary-scope')
  })

  it('focuses the first interactive element of the body, never the container (no green ring)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
    expect(screen.getByRole('button', { name: 'Add Product' })).toHaveFocus()
    expect(screen.getByRole('dialog')).not.toHaveFocus()
  })

  it('with no interactive content focuses the title (tabindex -1), still not the container', async () => {
    render(<Harness body="text" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
    const title = screen.getByRole('heading', { level: 2, name: 'Unknown barcode' })
    expect(title).toHaveFocus()
    expect(title).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('dialog')).not.toHaveFocus()
  })

  it('returns focus to the trigger on Escape and on Close', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open sheet' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(trigger).toHaveFocus()
  })
})
