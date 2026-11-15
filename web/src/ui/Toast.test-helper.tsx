// Test helper for the B9-18 toast tests: a button that shows a toast, and the usual set-up. Not product code.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { ToastProvider, useToast, type ToastContent, type ToastOptions } from './Toast'

export type Api = ReturnType<typeof useToast>

/** A button named `name` that shows `arg` (a message with `opts`, or a rich ToastContent) through useToast().show. */
export function Fire({ arg, opts, name = 'fire' }: { arg: string | ToastContent; opts?: ToastOptions; name?: string }) {
  const { show } = useToast()
  return <button onClick={() => show(arg, opts)}>{name}</button>
}

/** Exposes the whole ToastApi to a test (hold, release, handle). */
export function Grab({ into }: { into: { api?: Api } }) {
  into.api = useToast()
  return null
}

/** Fake timers (shouldAdvanceTime: Testing Library's async helpers need the clock to move; keep margins of 100 ms or more), a userEvent that advances them, and render inside a ToastProvider. */
export function setupTimed() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const mount = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>)
  return { user, mount }
}

export const toasts = () => [...document.querySelectorAll<HTMLElement>('.toast')]
export const titles = () => toasts().map((t) => t.querySelector('.toast__title')?.textContent ?? '')
export const fireButton = (name = 'fire') => screen.getByRole('button', { name })

/** Pretend the page is hidden (a background tab) or visible again, and tell the page. */
export function setHidden(hidden: boolean) {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden)
  document.dispatchEvent(new Event('visibilitychange'))
}
