// New-API tests for Toast (plan 4.8). The behaviour of the old tests in Overlays.test.tsx (4 s default, action, dismiss, provider guard) is kept.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast, type ToastOptions } from './Toast'

function Fire(props: { message: string; opts?: ToastOptions; name?: string }) {
  const { show } = useToast()
  return <button onClick={() => show(props.message, props.opts)}>{props.name ?? 'fire'}</button>
}

describe('Toast statuses', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('a success toast is a status with a status icon, gone after 4 s', async () => {
    const user = setup()
    render(<ToastProvider><Fire message="Saved" opts={{ status: 'success' }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    const toast = screen.getByRole('status')
    expect(toast).toHaveAttribute('data-status', 'success')
    expect(toast.querySelector('svg')).not.toBeNull()
    act(() => void vi.advanceTimersByTime(4100))
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('a toast with an action stays 6 s', async () => {
    const user = setup()
    render(<ToastProvider><Fire message="Removed" opts={{ actionLabel: 'Undo', onAction: () => {} }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    act(() => void vi.advanceTimersByTime(5900))
    expect(screen.getByText('Removed')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.queryByText('Removed')).toBeNull()
  })

  it('an error toast is role=alert and stays until dismissed', async () => {
    const user = setup()
    render(<ToastProvider><Fire message="Could not save" opts={{ status: 'error' }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
    act(() => void vi.advanceTimersByTime(120_000))
    expect(screen.getByText('Could not save')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Could not save')).toBeNull()
  })

  it('an explicit durationMs wins, even for errors', async () => {
    const user = setup()
    render(<ToastProvider><Fire message="Brief" opts={{ status: 'error', durationMs: 500 }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    act(() => void vi.advanceTimersByTime(600))
    expect(screen.queryByText('Brief')).toBeNull()
  })

  it('stacks at most 2: a third toast drops the oldest', async () => {
    const user = setup()
    render(
      <ToastProvider>
        <Fire message="one" name="a" />
        <Fire message="two" name="b" />
        <Fire message="three" name="c" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('a'))
    await user.click(screen.getByText('b'))
    await user.click(screen.getByText('c'))
    expect(screen.queryByText('one')).toBeNull()
    expect(screen.getByText('two')).toBeInTheDocument()
    expect(screen.getByText('three')).toBeInTheDocument()
  })

  it('the old tone option still renders a neutral toast (deprecated)', async () => {
    const user = setup()
    render(<ToastProvider><Fire message="Hi" opts={{ tone: 'accent' }} /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'neutral')
  })
})
