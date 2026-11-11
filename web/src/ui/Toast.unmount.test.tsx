// A pending auto-dismiss timer must not outlive the ToastProvider.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function Fire() {
  const { show } = useToast()
  return <button onClick={() => show('Saved')}>fire</button>
}

describe('Toast timers on unmount', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('unmounting the provider with a pending toast fires no dismiss afterwards', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<ToastProvider><Fire /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    unmount()
    act(() => void vi.advanceTimersByTime(10000))
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('clears every pending toast timer on unmount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = render(<ToastProvider><Fire /></ToastProvider>)
    await user.click(screen.getByText('fire'))
    await user.click(screen.getByText('fire'))
    clear.mockClear()
    unmount()
    expect(clear).toHaveBeenCalledTimes(2)
    clear.mockRestore()
  })
})
