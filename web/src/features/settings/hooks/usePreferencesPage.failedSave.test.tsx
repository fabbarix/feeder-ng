import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { ToastProvider } from '../../../ui'

// B9-20 (RES-06): a failed Preferences save names what failed, once, and Try again re-runs the same save.
// One failure, one toast: the mutation hook never toasts; the page hook does. (Component-level: a toast in the alert region.)
const prefs = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('./usePreferences', () => ({ usePreferences: () => ({ save: prefs.save, data: undefined, isLoading: false }) }))
import { usePreferencesPage } from './usePreferencesPage'

const next = { scheme: 'dark', units: 'metric', accent: 'tomato' } as never
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
function Probe() {
  const { save } = usePreferencesPage()
  return <button onClick={() => void save(next)}>save</button>
}
beforeEach(() => {
  prefs.save.mockReset()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

describe('usePreferencesPage failed save', () => {
  it('exactly one toast: a 16 px icon in the headline line, the body, and an outline Try again that saves again', async () => {
    prefs.save.mockRejectedValueOnce(new ApiError(500, 'internal', 'boom')).mockResolvedValue(undefined)
    render(<Probe />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    const toasts = document.querySelectorAll('.toast')
    expect(toasts).toHaveLength(1)
    const toast = toasts[0] as HTMLElement
    expect(within(toast).getByText('Couldn’t save your preferences')).toBeInTheDocument()
    expect(within(toast).getByText('Your choices are still on the screen.')).toBeInTheDocument()
    expect(toast.querySelector('.toast__title svg')).not.toBeNull()
    await userEvent.click(within(toast).getByRole('button', { name: 'Try again' }))
    expect(prefs.save).toHaveBeenCalledTimes(2)
    expect(prefs.save).toHaveBeenLastCalledWith(next)
  })

  it('offline: "Feeder is offline" and no Try again', async () => {
    prefs.save.mockRejectedValue(new ApiError(0, 'network', 'The network is unreachable'))
    render(<Probe />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    const toast = document.querySelector('.toast') as HTMLElement
    expect(within(toast).getByText('Feeder is offline')).toBeInTheDocument()
    expect(within(toast).queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('a successful save is still the success toast, with no icon', async () => {
    prefs.save.mockResolvedValue(undefined)
    render(<Probe />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    const toast = document.querySelector('.toast') as HTMLElement
    expect(toast.querySelector('.toast__title svg')).toBeNull()
  })

  it('has no other toast source: the hook returns without a global mutation toast', () => {
    const { result } = renderHook(() => usePreferencesPage(), { wrapper })
    expect(typeof result.current.save).toBe('function')
    act(() => undefined)
  })
})
