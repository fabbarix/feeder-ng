// B9-49 (RES-08): usePreferenceTheme writes the theme cache (theme/themeCache) whenever the User's preferences load or are saved, and
// starts from it: the theme is the cached one from the first render, before /api/me/preferences answers (no light Basil flash, and a dark
// User gets dark offline, where the preferences query pauses). A preview (an unsaved choice) never reaches the cache.
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeCachedMe } from '../../../app/meCache'
import { buildThemeCache, readThemeCache, writeThemeCache } from '../../../theme/themeCache'
import { mockApi, USER_ME, wrapper } from '../test-utils'
import { usePreferenceTheme } from './usePreferenceTheme'

beforeEach(() => localStorage.clear())

describe('usePreferenceTheme and the theme cache', () => {
  it('writes the cache once the preferences load: scheme, accent and both boot palettes', async () => {
    mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': { scheme: 'dark', accent: '#d9503f', units: 'metric' } })
    renderHook(() => usePreferenceTheme(), { wrapper })
    await waitFor(() => expect(readThemeCache()).not.toBeNull())
    expect(readThemeCache()).toEqual(buildThemeCache({ scheme: 'dark', accent: '#d9503f' }))
  })

  it('a returning User (remembered) starts from the cached theme: the first render is dark Tomato, not the defaults, while the preferences load', () => {
    writeCachedMe(USER_ME)
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: '#d9503f' }))
    mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': () => new Promise(() => {}) as never })
    const { result } = renderHook(() => usePreferenceTheme(), { wrapper })
    expect(result.current).toEqual({ accent: '#d9503f', scheme: 'dark' })
  })

  it('a changed preference on the server replaces the cache (the next launch paints the new theme)', async () => {
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: '#d9503f' }))
    mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': { scheme: 'light', accent: '#3366cc', units: 'metric' } })
    const { result } = renderHook(() => usePreferenceTheme(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ accent: '#3366cc', scheme: 'light' }))
    expect(readThemeCache()).toEqual(buildThemeCache({ scheme: 'light', accent: '#3366cc' }))
  })

  it('signed out (a 401 forgets the User and the cache with it): the defaults', async () => {
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: '#d9503f' }))
    const api = mockApi({ 'GET /api/me': { status: 401, json: { error: { code: 'unauthenticated', message: 'x' } } } })
    const { result } = renderHook(() => usePreferenceTheme(), { wrapper })
    await waitFor(() => expect(api.callsTo('GET', '/api/me')).toHaveLength(1))
    await waitFor(() => expect(result.current).toEqual({ accent: '#3f7d58', scheme: 'system' }))
  })
})
