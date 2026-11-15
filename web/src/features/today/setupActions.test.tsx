// B9-53 (TB-06): the Admin's writes from the first-run tile, in their own module (setupActions.ts) so the tests that mock ./setupSeam keep working.
// Both go through PUT /api/household/settings with the whole current settings, changed in one field group (the server keeps what a save leaves out).
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../test/notices'
import { mockApi, newQueryClient } from '../settings/test-utils'
import { QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../../ui'
import { settings } from '../../test/setupFacts'
import { useSetupActions } from './setupActions'

afterEach(() => vi.unstubAllGlobals())

function wrap({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

describe('confirmDeviceSettings: "Looks right"', () => {
  it('saves the time zone and currency with the rest of the settings kept as they are', async () => {
    const api = mockApi({
      'GET /api/household/settings': settings({ planningHorizonDays: 14, plannerStyle: 1, earliestStart: null }),
      'PUT /api/household/settings': (c: { body: unknown }) => ({ ...(c.body as object), timeZoneConfigured: true }),
    })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.confirmDeviceSettings({ timeZone: 'Europe/Rome', currency: 'EUR' }))
    const put = api.callsTo('PUT', '/api/household/settings')
    expect(put).toHaveLength(1)
    expect(put[0]!.body).toMatchObject({ timeZone: 'Europe/Rome', currency: 'EUR', planningHorizonDays: 14, plannerStyle: 1, earliestStart: null })
  })

  it('does not send the server-owned flag, and does not touch setupHidden', async () => {
    const api = mockApi({
      'GET /api/household/settings': settings({ setupHidden: true }),
      'PUT /api/household/settings': (c: { body: unknown }) => c.body,
    })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.confirmDeviceSettings({ timeZone: 'Europe/Rome', currency: 'EUR' }))
    const body = api.callsTo('PUT', '/api/household/settings')[0]!.body as Record<string, unknown>
    expect(body).not.toHaveProperty('timeZoneConfigured')
    expect(body.setupHidden === undefined || body.setupHidden === true).toBe(true)
  })

  it('toasts "Time zone and currency saved." (a plain toast, no icon, no Undo)', async () => {
    mockApi({ 'GET /api/household/settings': settings(), 'PUT /api/household/settings': (c: { body: unknown }) => c.body })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.confirmDeviceSettings({ timeZone: 'Europe/Rome', currency: 'EUR' }))
    const toast = await findToast('Time zone and currency saved.')
    expect(toast.querySelector('.toast__title svg')).toBeNull() // the round Dismiss has its own close icon; no success icon on the title
    expect(toast.textContent).not.toMatch(/Undo/)
  })

  it('a refused save says "That did not save. Try again." and the call rejects so the tile keeps the step current', async () => {
    mockApi({ 'GET /api/household/settings': settings(), 'PUT /api/household/settings': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(async () => {
      await expect(result.current.confirmDeviceSettings({ timeZone: 'Europe/Rome', currency: 'EUR' })).rejects.toBeTruthy()
    })
    await findToast('That did not save. Try again.')
  })
})

describe('setHidden: "Hide for now"', () => {
  it('hiding saves setupHidden true with the rest kept', async () => {
    const api = mockApi({ 'GET /api/household/settings': settings({ timeZone: 'Europe/Rome', timeZoneConfigured: true }), 'PUT /api/household/settings': (c: { body: unknown }) => c.body })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.hide())
    expect(api.callsTo('PUT', '/api/household/settings')[0]!.body).toMatchObject({ setupHidden: true, timeZone: 'Europe/Rome', currency: 'USD' })
  })

  it('shows a toast "Setup checklist hidden" with Undo and no icon; Undo saves setupHidden false', async () => {
    const api = mockApi({ 'GET /api/household/settings': settings(), 'PUT /api/household/settings': (c: { body: unknown }) => c.body })
    function Probe() {
      const { hide } = useSetupActions()
      return <button onClick={() => void hide()}>Hide now</button>
    }
    render(<Probe />, { wrapper: wrap })
    await userEvent.click(screen.getByRole('button', { name: 'Hide now' }))
    const toast = await findToast('Setup checklist hidden')
    expect(toast.querySelector('.toast__title svg')).toBeNull() // the round Dismiss has its own close icon; no success icon on the title
    await userEvent.click(toast.querySelector('button')!)
    await waitFor(() => expect(api.callsTo('PUT', '/api/household/settings')).toHaveLength(2))
    expect(api.callsTo('PUT', '/api/household/settings')[1]!.body).toMatchObject({ setupHidden: false })
  })

  it('the toast says where to get it back: "Show it again in Settings > Household."', async () => {
    mockApi({ 'GET /api/household/settings': settings(), 'PUT /api/household/settings': (c: { body: unknown }) => c.body })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.hide())
    const toast = await findToast('Setup checklist hidden')
    expect(toast.textContent).toContain('Show it again in Settings')
  })
})

describe('addMember and createMealSlots: the writes behind the two sheets', () => {
  const input = { name: 'Anna', colour: '#3366cc', avatar: '', portionFactor: 1 }

  it('addMember posts the Member and refreshes the facts (members, meal-slots) so the step can complete', async () => {
    const api = mockApi({ 'POST /api/members': { id: 7, ...input, userId: null, email: null } })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.addMember(input, null))
    expect(api.callsTo('POST', '/api/members')[0]!.body).toMatchObject({ name: 'Anna' })
  })

  it('a linked User is linked in a second call', async () => {
    const api = mockApi({ 'POST /api/members': { id: 7, ...input, userId: null, email: null }, 'PUT /api/members/7/user': { id: 7, ...input, userId: 2, email: null } })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.addMember(input, 2))
    expect(api.callsTo('PUT', '/api/members/7/user')[0]!.body).toEqual({ userId: 2 })
  })

  it('createMealSlots posts one batch and everyone attends (the server does it)', async () => {
    const slots = [
      { name: 'Lunch', time: '13:00', weekdays: [1, 2, 3, 4, 5, 6, 7] },
      { name: 'Dinner', time: '19:30', weekdays: [1, 2, 3, 4, 5, 6, 7] },
    ]
    const api = mockApi({ 'POST /api/meal-slots/batch': { status: 201, json: { created: [] } } })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(() => result.current.createMealSlots(slots))
    expect(api.callsTo('POST', '/api/meal-slots/batch')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/meal-slots/batch')[0]!.body).toEqual({ slots })
  })

  it('a refused batch (duplicate Meal Slot, 409) rejects with the server\'s words so the sheet can show its one error', async () => {
    mockApi({ 'POST /api/meal-slots/batch': { status: 409, json: { error: { code: 'duplicate_slot', message: 'Dinner already exists on Tuesday.' } } } })
    const { result } = renderHook(() => useSetupActions(), { wrapper: wrap })
    await act(async () => {
      await expect(result.current.createMealSlots([{ name: 'Dinner', time: '19:30', weekdays: [2] }])).rejects.toMatchObject({ message: 'Dinner already exists on Tuesday.' })
    })
  })
})
