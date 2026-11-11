import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../settings/test-utils'
import { hashEndpoint } from '../lib/devices'
import type { PushEnvironment } from '../lib/webpush'
import type { BrowserSubscription, PushDevice } from '../types'
import { useNotificationSettings, type PushPort } from './useNotificationSettings'

const flags = { advanceStep: false, startCooking: false, confirmCooked: false, leftoverUseBy: false, stockSpoil: false, timerFinished: false, accessRequest: false }
const config = { vapidPublicKey: 'BAUF', types: Object.keys(flags), quietHours: { start: '22:00', end: '07:00' }, timeZone: 'Europe/Rome' }
const sub: BrowserSubscription = { endpoint: 'https://push.example/pixel', keys: { p256dh: 'p', auth: 'a' } }
const env: PushEnvironment = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: 'default', isIos: false, isStandalone: false }

function port(over: Partial<PushPort> = {}): PushPort & { subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> } {
  return {
    environment: () => env,
    userAgent: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile',
    currentSubscription: vi.fn(async () => null),
    requestPermission: vi.fn(async () => 'granted' as const),
    subscribe: vi.fn(async () => sub),
    unsubscribe: vi.fn(async () => {}),
    ...over,
  } as never
}

async function deviceFor(endpoint: string, id: number, on: Partial<typeof flags> = {}): Promise<PushDevice> {
  return { id, label: 'Pixel', createdAt: '2026-11-09T12:00:00Z', endpointHash: await hashEndpoint(endpoint), types: { ...flags, ...on } }
}

afterEach(() => vi.unstubAllGlobals())

describe('useNotificationSettings', () => {
  it('finds this device among the registered ones by endpoint hash', async () => {
    const mine = await deviceFor(sub.endpoint, 1, { advanceStep: true })
    const other = await deviceFor('https://push.example/tablet', 2)
    mockApi({ 'GET /api/notifications/config': config, 'GET /api/notifications/devices': { devices: [mine, other] } })
    const { result } = renderHook(() => useNotificationSettings(port({ currentSubscription: async () => sub })), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.support).toBe('supported')
    expect(result.current.thisDevice?.id).toBe(1)
    expect(result.current.otherDevices.map((d) => d.id)).toEqual([2])
    expect(result.current.config?.quietHours).toEqual({ start: '22:00', end: '07:00' })
  })

  it('enable asks permission, subscribes with the server key and registers the device', async () => {
    const mine = await deviceFor(sub.endpoint, 5)
    let registered = false
    const api = mockApi({
      'GET /api/notifications/config': config,
      'GET /api/notifications/devices': () => ({ devices: registered ? [mine] : [] }),
      'POST /api/notifications/devices': () => {
        registered = true
        return { status: 201, json: mine }
      },
    })
    const p = port()
    p.currentSubscription = vi.fn(async () => (registered ? sub : null))
    const { result } = renderHook(() => useNotificationSettings(p), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.thisDevice).toBeUndefined()
    await act(async () => {
      await result.current.enable()
    })
    expect(p.requestPermission).toHaveBeenCalled()
    expect(p.subscribe).toHaveBeenCalledTimes(1)
    expect(p.subscribe.mock.calls[0]![0]).toBeInstanceOf(Uint8Array)
    expect(api.callsTo('POST', '/api/notifications/devices')[0]?.body).toMatchObject({
      endpoint: sub.endpoint,
      keys: sub.keys,
      label: 'Android phone',
    })
    await waitFor(() => expect(result.current.thisDevice?.id).toBe(5))
  })

  it('does not subscribe or register when permission is refused', async () => {
    const api = mockApi({ 'GET /api/notifications/config': config, 'GET /api/notifications/devices': { devices: [] } })
    const p = port({ requestPermission: vi.fn(async () => 'denied' as const) })
    const { result } = renderHook(() => useNotificationSettings(p), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.enable()
    })
    expect(p.subscribe).not.toHaveBeenCalled()
    expect(api.callsTo('POST', '/api/notifications/devices')).toHaveLength(0)
  })

  it('does nothing on a browser without push', async () => {
    const api = mockApi({ 'GET /api/notifications/config': config, 'GET /api/notifications/devices': { devices: [] } })
    const p = port({ environment: () => ({ ...env, hasPushManager: false }) })
    const { result } = renderHook(() => useNotificationSettings(p), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.support).toBe('unsupported')
    await act(async () => {
      await result.current.enable()
    })
    expect(p.requestPermission).not.toHaveBeenCalled()
    expect(api.callsTo('POST', '/api/notifications/devices')).toHaveLength(0)
  })

  it('setType puts only the changed type', async () => {
    const mine = await deviceFor(sub.endpoint, 1)
    const api = mockApi({
      'GET /api/notifications/config': config,
      'GET /api/notifications/devices': { devices: [mine] },
      'PUT /api/notifications/devices/1': { ...mine, types: { ...flags, stockSpoil: true } },
    })
    const { result } = renderHook(() => useNotificationSettings(port({ currentSubscription: async () => sub })), { wrapper })
    await waitFor(() => expect(result.current.thisDevice).toBeDefined())
    await act(async () => {
      await result.current.setType(1, 'stockSpoil', true)
    })
    expect(api.callsTo('PUT', '/api/notifications/devices/1')[0]?.body).toEqual({ types: { stockSpoil: true } })
  })

  it('disable unsubscribes the browser and deletes the device', async () => {
    const mine = await deviceFor(sub.endpoint, 1)
    const api = mockApi({
      'GET /api/notifications/config': config,
      'GET /api/notifications/devices': { devices: [mine] },
      'DELETE /api/notifications/devices/1': { status: 204 },
    })
    const p = port({ currentSubscription: async () => sub })
    const { result } = renderHook(() => useNotificationSettings(p), { wrapper })
    await waitFor(() => expect(result.current.thisDevice).toBeDefined())
    await act(async () => {
      await result.current.disable()
    })
    expect(p.unsubscribe).toHaveBeenCalled()
    expect(api.callsTo('DELETE', '/api/notifications/devices/1')).toHaveLength(1)
  })

  it('removeDevice deletes another device without touching this browser', async () => {
    const other = await deviceFor('https://push.example/tablet', 2)
    const api = mockApi({
      'GET /api/notifications/config': config,
      'GET /api/notifications/devices': { devices: [other] },
      'DELETE /api/notifications/devices/2': { status: 204 },
    })
    const p = port()
    const { result } = renderHook(() => useNotificationSettings(p), { wrapper })
    await waitFor(() => expect(result.current.otherDevices).toHaveLength(1))
    await act(async () => {
      await result.current.removeDevice(2)
    })
    expect(api.callsTo('DELETE', '/api/notifications/devices/2')).toHaveLength(1)
    expect(p.unsubscribe).not.toHaveBeenCalled()
  })

  it('reports a load error', async () => {
    mockApi({
      'GET /api/notifications/config': { status: 500, json: { error: { code: 'boom', message: 'x' } } },
      'GET /api/notifications/devices': { devices: [] },
    })
    const { result } = renderHook(() => useNotificationSettings(port()), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
  })
})
