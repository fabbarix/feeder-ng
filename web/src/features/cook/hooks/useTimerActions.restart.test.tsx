// B9-40 (main-session ruling 4): "Add 1 minute" is cancel-then-start; if the second call fails the timer is started again with the time it
// had and a warning toast says so; the cook is never left without the timer silently.
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import type { CookTimer } from '../types'
import { useTimerActions, type TimerActionsSource } from './useTimerActions'

const timer: CookTimer = { id: 5, scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 600, state: 'running', remainingSeconds: 163, endsAt: null, startedAt: '' }

function setup(start: TimerActionsSource['start'], cancel: TimerActionsSource['cancel'] = vi.fn(async () => {})) {
  const source: TimerActionsSource = { items: [{ timer, seconds: 163 }], start, cancel, pause: vi.fn(async () => {}), resume: vi.fn(async () => {}) }
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
  return { ...renderHook(() => useTimerActions(source), { wrapper }), source }
}

const toastText = () => document.querySelector('.toast')?.textContent ?? ''

describe('useTimerActions Add 1 minute when the restart fails', () => {
  it('starts the timer again with the time it had, and a warning toast says the minute was not added', async () => {
    const start = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...timer, id: 9 })
    const { result } = setup(start)
    await act(() => result.current.addMinute(5))
    expect(start).toHaveBeenNthCalledWith(1, { scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 223 })
    expect(start).toHaveBeenNthCalledWith(2, { scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 163 })
    await waitFor(() => expect(toastText()).toContain('The minute was not added'))
    expect(toastText()).toContain('Pre-heat the oven goes on with 2:43 left.')
    expect(document.querySelector('.toast')).toHaveAttribute('data-status', 'warning')
  })

  it('when the timer cannot be started again either, a warning that stays names it and its time', async () => {
    const start = vi.fn().mockRejectedValue(new Error('offline'))
    const { result } = setup(start)
    await act(() => result.current.addMinute(5))
    expect(start).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(toastText()).toContain('Pre-heat the oven stopped'))
    expect(toastText()).toContain('2:43')
  })

  it('the lost timer\'s warning offers "Start again", which starts it with the time it had (B9-40 review)', async () => {
    const start = vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...timer, id: 11 })
    const { result } = setup(start)
    await act(() => result.current.addMinute(5))
    await userEvent.click(await screen.findByRole('button', { name: 'Start Pre-heat the oven again' }))
    await waitFor(() => expect(start).toHaveBeenCalledTimes(3))
    expect(start).toHaveBeenLastCalledWith({ scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 163 })
  })

  it('a failed cancel changes nothing and says so: no start, an error toast', async () => {
    const start = vi.fn()
    const { result } = setup(start, vi.fn().mockRejectedValue(new Error('offline')))
    await act(() => result.current.addMinute(5))
    expect(start).not.toHaveBeenCalled()
    await waitFor(() => expect(toastText()).toContain('That did not work. Try again.'))
  })
})
