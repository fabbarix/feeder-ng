// QA-2: the Allowlist page's own copy uses glossary words. "Guest" is an _Avoid_ word (Attendance), and the Allowlist
// copy names Users and Access Requests ("Sign-in requests"), never guests, invites or join requests.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin, cook } from '../components/fixtures'
import { settingsStrings } from '../strings'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { AllowlistPage } from './AllowlistPage'

afterEach(() => vi.unstubAllGlobals())

describe('Allowlist copy', () => {
  it('shows no avoided word on the page', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/allowlist': [admin, cook] })
    const { container } = renderWithProviders(<AllowlistPage />, '/settings/allowlist')
    await screen.findByRole('heading', { level: 1, name: 'Allowlist' })
    await screen.findByText(admin.email)
    expect(container.textContent ?? '').not.toMatch(/\bguests?\b|\binvit|join request/i)
  })
  it('the Allowlist strings contain none either', () => {
    const copy = JSON.stringify({ a: settingsStrings.allowlist, b: settingsStrings.allowlistAdminOnly, c: settingsStrings.allowlistPanel, d: settingsStrings.index.sections.allowlist })
    expect(copy).not.toMatch(/\bguests?\b|\binvit|join request/i)
  })
})
