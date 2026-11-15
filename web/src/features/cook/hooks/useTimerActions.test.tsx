// B9-40 (PC-03): the timer sheet's actions. Cancel shows an Undo toast ("Timer cancelled" / "Pre-heat the oven"); Undo starts the timer again
// with what was left; Add 1 minute starts it again a minute longer.
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import type { CookTimer } from '../types'
import { useTimerActions, type TimerActionsSource } from './useTimerActions'

const timer = (over: Partial<CookTimer>): CookTimer => ({
  id: 5, scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 600, state: 'running', remainingSeconds: 163, endsAt: null, startedAt: '', ...over,
})

function setup(items: { timer: CookTimer; seconds: number }[]) {
  const calls: string[] = []
  const source: TimerActionsSource = {
    items,
    start: vi.fn(async (input) => {
      calls.push('start')
      return timer({ id: 99, ...input })
    }),
    pause: vi.fn(async () => {
      calls.push('pause')
    }),
    resume: vi.fn(async () => {
      calls.push('resume')
    }),
    cancel: vi.fn(async () => {
      calls.push('cancel')
    }),
  }
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
  const hook = renderHook(() => useTimerActions(source), { wrapper })
  return { ...hook, source, calls }
}

describe('useTimerActions', () => {
  it('pause and resume go to the timers', async () => {
    const { result, source } = setup([{ timer: timer({}), seconds: 163 }])
    await act(() => result.current.pause(5))
    await act(() => result.current.resume(5))
    expect(source.pause).toHaveBeenCalledWith(5)
    expect(source.resume).toHaveBeenCalledWith(5)
  })

  it('Add 1 minute cancels the timer and starts it again with 60 seconds more, same scope, Step and label', async () => {
    const { result, source, calls } = setup([{ timer: timer({}), seconds: 163 }])
    await act(() => result.current.addMinute(5))
    expect(source.cancel).toHaveBeenCalledWith(5)
    expect(source.start).toHaveBeenCalledWith({ scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 223 })
    expect(calls).toEqual(['cancel', 'start'])
  })

  it('Add 1 minute on a free timer sends only its label and time', async () => {
    const { result, source } = setup([{ timer: timer({ id: 8, scope: null, step: null, label: 'Eggs' }), seconds: 90 }])
    await act(() => result.current.addMinute(8))
    expect(source.start).toHaveBeenCalledWith({ label: 'Eggs', durationSeconds: 150 })
  })

  it('Scenario: I can undo a cancelled timer: Cancel shows "Timer cancelled" with the timer\'s name, and Undo starts it again with what was left', async () => {
    const { result, source } = setup([{ timer: timer({}), seconds: 163 }])
    await act(() => result.current.cancel(5))
    expect(source.cancel).toHaveBeenCalledWith(5)
    const toast = await waitFor(() => {
      const el = document.querySelector('.toast') as HTMLElement | null
      expect(el).not.toBeNull()
      return el!
    })
    expect(toast).toHaveTextContent('Timer cancelled')
    expect(toast).toHaveTextContent('Pre-heat the oven')
    expect(source.start).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(source.start).toHaveBeenCalledTimes(1))
    expect(source.start).toHaveBeenCalledWith({ scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 163 })
  })

  it('Dismiss on a finished timer clears it with no toast and no Undo', async () => {
    const { result, source } = setup([{ timer: timer({ state: 'finished' }), seconds: 0 }])
    await act(() => result.current.dismiss(5))
    expect(source.cancel).toHaveBeenCalledWith(5)
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('a timer that is not in the list changes nothing', async () => {
    const { result, source } = setup([])
    await act(() => result.current.cancel(5))
    await act(() => result.current.addMinute(5))
    expect(source.cancel).not.toHaveBeenCalled()
    expect(source.start).not.toHaveBeenCalled()
    expect(document.querySelector('.toast')).toBeNull()
  })
})
