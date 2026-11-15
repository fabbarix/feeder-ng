// B9-52 (SET-03): useShareText(probe) -> { canShare, share(data) }.
//   canShare: navigator.share exists and navigator.canShare(probe) is not false. Decided once, at the first render ("once per page
//   load"): a later change to navigator does not change it.
//   share(data): 'shared' when the sheet resolves, 'cancelled' for an AbortError (the person closed it: nothing else happens),
//   'failed' for NotAllowedError and for any other error, and 'failed' when there is no share sheet. It never rejects.
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShareText } from './useShareText'

afterEach(() => vi.unstubAllGlobals())

const probe: ShareData = { title: 'Sign in to Feeder', text: 'Hello', url: 'https://feeder.example.test' }
const stubNavigator = (extra: Record<string, unknown>) => vi.stubGlobal('navigator', { ...extra })
const named = (name: string) => Object.assign(new Error(name), { name })

describe('useShareText: canShare', () => {
  it('is false when the browser has no share sheet', () => {
    stubNavigator({})
    expect(renderHook(() => useShareText(probe)).result.current.canShare).toBe(false)
  })
  it('is true with navigator.share and no canShare to ask', () => {
    stubNavigator({ share: vi.fn() })
    expect(renderHook(() => useShareText(probe)).result.current.canShare).toBe(true)
  })
  it('is false when canShare(data) says no for this payload', () => {
    const canShare = vi.fn().mockReturnValue(false)
    stubNavigator({ share: vi.fn(), canShare })
    expect(renderHook(() => useShareText(probe)).result.current.canShare).toBe(false)
    expect(canShare).toHaveBeenCalledWith(probe)
  })
  it('is true when canShare(data) says yes', () => {
    stubNavigator({ share: vi.fn(), canShare: vi.fn().mockReturnValue(true) })
    expect(renderHook(() => useShareText(probe)).result.current.canShare).toBe(true)
  })
  it('is decided once: a navigator that changes later does not change it', () => {
    stubNavigator({ share: vi.fn() })
    const view = renderHook(() => useShareText(probe))
    stubNavigator({})
    view.rerender()
    expect(view.result.current.canShare).toBe(true)
  })
})

describe('useShareText: share', () => {
  it('hands the payload to navigator.share and says shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share })
    const { result } = renderHook(() => useShareText(probe))
    await expect(result.current.share(probe)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(probe)
  })
  it('maps AbortError (the person closed the sheet) to cancelled', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(named('AbortError')) })
    const { result } = renderHook(() => useShareText(probe))
    await expect(result.current.share(probe)).resolves.toBe('cancelled')
  })
  it('maps NotAllowedError to failed', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(named('NotAllowedError')) })
    const { result } = renderHook(() => useShareText(probe))
    await expect(result.current.share(probe)).resolves.toBe('failed')
  })
  it('maps any other error, and a throw at once, to failed', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(new TypeError('bad data')) })
    await expect(renderHook(() => useShareText(probe)).result.current.share(probe)).resolves.toBe('failed')
    stubNavigator({
      share: vi.fn(() => {
        throw new Error('sync')
      }),
    })
    await expect(renderHook(() => useShareText(probe)).result.current.share(probe)).resolves.toBe('failed')
  })
  it('says failed (and does not throw) when there is no share sheet', async () => {
    stubNavigator({})
    await expect(renderHook(() => useShareText(probe)).result.current.share(probe)).resolves.toBe('failed')
  })
})
