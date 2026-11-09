import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { ToastProvider, useToast } from './Toast'

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="Unknown barcode">body</BottomSheet>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal dialog labelled by its title, and takes focus', () => {
    render(<BottomSheet open onClose={() => {}} title="Unknown barcode"><button>Add Product</button></BottomSheet>)
    const dialog = screen.getByRole('dialog', { name: 'Unknown barcode' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes on Escape, on the Close button and on a backdrop click', async () => {
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} title="T">body</BottomSheet>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close when the content is clicked', async () => {
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} title="T"><p>inside</p></BottomSheet>)
    await userEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

function Trigger(props: { message: string; opts?: Parameters<ReturnType<typeof useToast>['show']>[1] }) {
  const { show } = useToast()
  return <button onClick={() => show(props.message, props.opts)}>fire</button>
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows a message in a status live region and auto-dismisses after 4 s', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ToastProvider><Trigger message="Saved" /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    act(() => void vi.advanceTimersByTime(3900))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('respects a custom duration', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ToastProvider><Trigger message="Quick" opts={{ durationMs: 1000 }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    act(() => void vi.advanceTimersByTime(1100))
    expect(screen.queryByText('Quick')).toBeNull()
  })

  it('runs the action and dismisses', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onAction = vi.fn()
    render(<ToastProvider><Trigger message="Removed" opts={{ actionLabel: 'Undo', onAction }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.queryByText('Removed')).toBeNull()
  })

  it('can be dismissed manually', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ToastProvider><Trigger message="Hello" /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Hello')).toBeNull()
  })

  it('useToast outside a provider fails loudly', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})
