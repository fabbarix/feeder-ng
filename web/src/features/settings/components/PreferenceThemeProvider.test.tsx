import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, newQueryClient, USER_ME } from '../test-utils'
import { PreferenceThemeProvider } from './PreferenceThemeProvider'

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-scheme')
})

const primary = () => document.documentElement.style.getPropertyValue('--color-primary')

function mount() {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <PreferenceThemeProvider>
        <p>app</p>
      </PreferenceThemeProvider>
    </QueryClientProvider>,
  )
}

describe('PreferenceThemeProvider', () => {
  it('renders its children and themes with the default accent while signed out', async () => {
    const api = mockApi({ 'GET /api/me': { status: 401, json: { error: { code: 'unauthenticated', message: 'x' } } } })
    mount()
    expect(screen.getByText('app')).toBeInTheDocument()
    await waitFor(() => expect(api.callsTo('GET', '/api/me')).toHaveLength(1))
    expect(primary()).not.toBe('')
    expect(document.documentElement.dataset.scheme).toBe('light')
  })

  it('applies the signed-in User\'s mode and accent', async () => {
    mockApi({
      'GET /api/me': USER_ME,
      'GET /api/me/preferences': { scheme: 'dark', accent: '#3366cc', secondary: null, units: 'metric' },
    })
    mount()
    const before = primary()
    await waitFor(() => expect(document.documentElement.dataset.scheme).toBe('dark'))
    expect(primary()).not.toBe(before)
  })
})
