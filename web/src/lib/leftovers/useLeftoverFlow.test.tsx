// Round 2: an answer that would replan asks through the shared ConfirmDialog (no LeftoverAskDialog, no `asked` state).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../features/settings/test-utils'
import { ConfirmProvider, ToastProvider } from '../../ui'
import { friLunch, leftover, TODAY } from './fixtures'
import { useLeftoverFlow } from './useLeftoverFlow'

afterEach(() => vi.unstubAllGlobals())
const asked = leftover({ id: 3, portions: 2, useBy: '2026-11-10', toAnswer: true })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider>
  </QueryClientProvider>
)
const stubs = (replanned: unknown[]) =>
  mockApi({
    'GET /api/plan/leftovers': { leftovers: [asked] },
    'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned },
    'POST /api/plan/leftovers/3/answer': { status: 204 },
  })

describe('useLeftoverFlow.answer', () => {
  it('has no asked state any more', () => {
    stubs([])
    const { result } = renderHook(() => useLeftoverFlow(TODAY), { wrapper })
    expect(result.current).not.toHaveProperty('asked')
    expect(result.current).not.toHaveProperty('confirmAnswer')
    expect(result.current).not.toHaveProperty('cancelAnswer')
  })

  it('asks in a confirm titled "Replan for Chilli?", danger for Threw it out, and answers after the yes', async () => {
    const api = stubs([friLunch])
    const { result } = renderHook(() => useLeftoverFlow(TODAY), { wrapper })
    let done: Promise<void> = Promise.resolve()
    act(() => { done = result.current.answer(asked, 'threw_out') })
    const dialog = await screen.findByRole('dialog', { name: 'Replan for Chilli?' })
    expect(dialog).toHaveAttribute('data-tone', 'danger')
    expect(dialog).toHaveTextContent('Fri Lunch was going to have it; it is planned again.')
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Threw it out' }))
    await act(async () => { await done })
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')[0]?.body).toEqual({ answer: 'threw_out' })
  })

  it('Cancel answers nothing', async () => {
    const api = stubs([friLunch])
    const { result } = renderHook(() => useLeftoverFlow(TODAY), { wrapper })
    let done: Promise<void> = Promise.resolve()
    act(() => { done = result.current.answer(asked, 'had_it') })
    const dialog = await screen.findByRole('dialog', { name: 'Replan for Chilli?' })
    expect(dialog).toHaveAttribute('data-tone', 'default')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => { await done })
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(0)
  })

  it('answers without asking when nothing would be replanned', async () => {
    const api = stubs([])
    const { result } = renderHook(() => useLeftoverFlow(TODAY), { wrapper })
    await act(async () => { await result.current.answer(asked, 'had_it') })
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
