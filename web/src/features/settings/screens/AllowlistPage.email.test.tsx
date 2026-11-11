// F-02 + A1 phase 2: adding an address that is a Member's email (or already a User) is refused with 409 email_taken
// (docs/dev/design/a1-access-requests.md 2.6). The page shows the one wording of Members and allowlist, under the
// email field, keeps what was typed, and points to Sign-in requests with the hint "People can also ask to join".
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin, cook } from '../components/fixtures'
import { findNotice, noticeWith } from '../../../test/notices'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { AllowlistPage } from './AllowlistPage'

afterEach(() => vi.unstubAllGlobals())

const TAKEN = { status: 409, json: { error: { code: 'email_taken', message: 'That email already belongs to a Member, a User or the allowlist' } } }

describe('AllowlistPage: add an address', () => {
  it('409 email_taken (a Member\'s email) shows the message under the field and keeps the text', async () => {
    const api = mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/allowlist': [admin, cook], 'POST /api/allowlist': TAKEN })
    renderWithProviders(<AllowlistPage />, '/settings/allowlist')
    const input = await screen.findByLabelText('Email to allow')
    await userEvent.type(input, 'anna@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/allowlist')).toHaveLength(1))
    const alert = await findNotice('alert', 'That email already belongs to a Member, a User or the allowlist.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    expect(input).toHaveValue('anna@example.test')
  })

  it('the refusal is cleared when the Admin changes the address', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/allowlist': [admin, cook], 'POST /api/allowlist': TAKEN })
    renderWithProviders(<AllowlistPage />, '/settings/allowlist')
    const input = await screen.findByLabelText('Email to allow')
    await userEvent.type(input, 'anna@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    await findNotice('alert', 'That email already belongs')
    await userEvent.type(input, 'x')
    expect(noticeWith('alert', 'That email already belongs')).toBeUndefined()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('a refused remove (last Admin) is the page alert, not an error on the email field', async () => {
    mockApi({
      'GET /api/me': ADMIN_ME,
      'GET /api/allowlist': [admin, { ...cook, isAdmin: true }],
      'PATCH /api/allowlist/2': { status: 409, json: { error: { code: 'last_admin', message: 'x' } } },
    })
    renderWithProviders(<AllowlistPage />, '/settings/allowlist')
    await userEvent.click(await screen.findByRole('switch', { name: 'Admin: cook@example.test' }))
    expect(await findNotice('alert', 'at least one Admin')).toBeInTheDocument()
    expect(screen.getByLabelText('Email to allow')).not.toHaveAttribute('aria-invalid')
  })

  it('shows the hint and the link to Sign-in requests', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/allowlist': [admin, cook] })
    renderWithProviders(<AllowlistPage />, '/settings/allowlist')
    expect(await screen.findByText(/People can also ask to join/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign-in requests' })).toHaveAttribute('href', '/settings/access-requests')
  })
})
