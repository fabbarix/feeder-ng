// B9-20 (RES-02) on the Meal Slots page: the hook returns `state`. "Unknown is not empty."
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/providers'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { householdSettings, anna, marco, tuesdayDinner } from '../components/fixtures'
import { ADMIN_ME, mockApi } from '../test-utils'
import { useMealSlotsPage } from './useMealSlotsPage'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    <ToastProvider>
      {/* The page hook asks the Remove Meal Slot confirm through useConfirm (B9-42). */}
      <ConfirmProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>
  </QueryClientProvider>
)
const ok = (slots: unknown[]) =>
  mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/household/settings': householdSettings, 'GET /api/members': [anna, marco], 'GET /api/meal-slots': slots, 'GET /api/meal-slots?removed=with-history': [] })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.dispatchEvent(new Event('online'))
})

describe('useMealSlotsPage().state', () => {
  it('loading, then ready', async () => {
    ok([tuesdayDinner])
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper })
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current.state).toBe('ready'))
  })
  it('a household with no Meal Slot is empty (the page shows its own empty state, not a loading line)', async () => {
    ok([])
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('empty'))
  })
  it('a failing read is failed, never an empty list', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/household/settings': householdSettings, 'GET /api/members': [anna], 'GET /api/meal-slots': { status: 403, json: { error: { code: 'forbidden', message: 'No' } } } })
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.cards).toEqual([])
  })
  it('offline with nothing ever loaded is offlineUnknown, not empty and not failed', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper })
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))))
    expect(result.current.state).toBe('offlineUnknown')
  })
})
