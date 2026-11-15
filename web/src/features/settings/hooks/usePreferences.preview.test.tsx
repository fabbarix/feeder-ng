// B9-36 (SAFE-08): usePreferences returns `saved`, `effective = preview ?? saved` and `dirty`; every consumer reads `effective`.
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferencePreview } from '../lib/preferencePreview'
import { mockApi, newQueryClient, USER_ME } from '../test-utils'
import { PreferenceThemeProvider } from '../components/PreferenceThemeProvider'
import { usePreferences } from './usePreferences'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useCookContext } from '../../plan/hooks/useCookContext'

const saved = { scheme: 'system', accent: '#3f7d58', units: 'metric' }
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={newQueryClient()}>{children}</QueryClientProvider>

afterEach(() => {
  preferencePreview.clear()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-scheme')
})

const api = () => mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': saved })

describe('usePreferences with a preview', () => {
  it('is clean with no preview: effective equals saved', async () => {
    api()
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.saved).toEqual(saved)
    expect(result.current.effective).toEqual(saved)
    expect(result.current.dirty).toBe(false)
  })

  it('a preview is the effective value and makes it dirty; the saved value is untouched', async () => {
    api()
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    act(() => preferencePreview.set({ ...saved, scheme: 'dark' } as never))
    expect(result.current.effective.scheme).toBe('dark')
    expect(result.current.saved.scheme).toBe('system')
    expect(result.current.dirty).toBe(true)
    act(() => preferencePreview.clear())
    expect(result.current.effective.scheme).toBe('system')
    expect(result.current.dirty).toBe(false)
  })

  it('a preview equal to the saved value is not dirty', async () => {
    api()
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    act(() => preferencePreview.set({ ...saved, accent: '#3F7D58' } as never))
    expect(result.current.dirty).toBe(false)
  })

  it('a successful save clears the preview, so the saved value is what shows', async () => {
    mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': saved, 'PUT /api/me/preferences': (c: { body: object }) => c.body })
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    const next = { ...saved, scheme: 'dark' } as never
    act(() => preferencePreview.set(next))
    await act(() => result.current.save(next))
    expect(preferencePreview.get()).toBeNull()
    expect(result.current.saved.scheme).toBe('dark')
    expect(result.current.dirty).toBe(false)
  })

  it('a failed save keeps the preview', async () => {
    mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': saved, 'PUT /api/me/preferences': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    const next = { ...saved, scheme: 'dark' } as never
    act(() => preferencePreview.set(next))
    await act(async () => {
      await result.current.save(next).catch(() => undefined)
    })
    expect(preferencePreview.get()).toEqual(next)
    expect(result.current.dirty).toBe(true)
  })
})

describe('the consumers read the effective value', () => {
  it('PreferenceThemeProvider sets the scheme on the document at once, without a save', async () => {
    const calls = api()
    render(
      <QueryClientProvider client={newQueryClient()}>
        <PreferenceThemeProvider>
          <p>app</p>
        </PreferenceThemeProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(calls.callsTo('GET', '/api/me/preferences')).toHaveLength(1))
    act(() => preferencePreview.set({ ...saved, scheme: 'dark' } as never))
    await waitFor(() => expect(document.documentElement.dataset.scheme).toBe('dark'))
    expect(calls.calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
    expect(screen.getByText('app')).toBeInTheDocument()
    act(() => preferencePreview.clear())
    await waitFor(() => expect(document.documentElement.dataset.scheme).toBe('light'))
  })

  it('PreferenceThemeProvider previews the accent (the theme variables change)', async () => {
    api()
    render(
      <QueryClientProvider client={newQueryClient()}>
        <PreferenceThemeProvider>
          <p>app</p>
        </PreferenceThemeProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--color-primary')).not.toBe(''))
    const before = document.documentElement.style.getPropertyValue('--color-primary')
    act(() => preferencePreview.set({ ...saved, accent: '#c0392b' } as never))
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--color-primary')).not.toBe(before))
  })

  it('useDisplayUnitSystem shows Imperial while previewed and Metric again after clear', async () => {
    api()
    const { result } = renderHook(() => useDisplayUnitSystem(), { wrapper })
    expect(result.current).toBe('metric')
    act(() => preferencePreview.set({ ...saved, units: 'imperial' } as never))
    expect(result.current).toBe('imperial')
    act(() => preferencePreview.clear())
    expect(result.current).toBe('metric')
  })

  it('useCookContext carries the previewed unit system', async () => {
    api()
    const { result } = renderHook(() => useCookContext(true), { wrapper })
    expect(result.current.unitSystem).toBe('metric')
    act(() => preferencePreview.set({ ...saved, units: 'imperial' } as never))
    expect(result.current.unitSystem).toBe('imperial')
  })
})
