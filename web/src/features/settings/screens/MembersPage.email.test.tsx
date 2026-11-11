// A1 phase 2: the Admin sets a Member's email on the Members page. The email goes out as `email` on POST and PATCH
// /api/members; a refusal (409 email_taken, 422 validation_failed naming email) is shown under the Email field and the
// sheet stays open. Spec docs/dev/design/a1-access-requests.md 2.6.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin, anna, cook, marco, sam } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { MembersPage } from './MembersPage'

afterEach(() => vi.unstubAllGlobals())

const routes = (members: unknown[] = [anna, marco, sam], extra: Record<string, unknown> = {}) =>
  mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/members': members, 'GET /api/allowlist': [admin, cook], ...extra })

const TAKEN = { status: 409, json: { error: { code: 'email_taken', message: 'That email already belongs to a Member, a User or the allowlist' } } }

describe('MembersPage: Member email', () => {
  it('adds a Member with an email: POST /api/members carries email', async () => {
    const api = routes([anna], { 'POST /api/members': (c: { body: object }) => ({ status: 201, json: { ...c.body, id: 9, userId: null } }) })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nonna@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/members')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/members')[0]!.body).toMatchObject({ name: 'Nonna', email: 'nonna@example.test' })
  })

  it('a Member without an email goes out with email: null', async () => {
    const api = routes([anna], { 'POST /api/members': (c: { body: object }) => ({ status: 201, json: { ...c.body, id: 9, userId: null } }) })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save Member' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/members')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/members')[0]!.body).toHaveProperty('email', null)
  })

  it('editing shows the stored email and PATCH sends the changed one', async () => {
    const api = routes([{ ...anna, email: 'anna@example.test' }, marco], { 'PATCH /api/members/1': (c: { body: object }) => ({ ...anna, ...c.body }) })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /^Anna/ }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Member' })
    const email = within(dialog).getByLabelText('Email')
    expect(email).toHaveValue('anna@example.test')
    await userEvent.clear(email)
    await userEvent.type(email, 'anna@home.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/members/1')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/members/1')[0]!.body).toMatchObject({ email: 'anna@home.test' })
  })

  it('409 email_taken: the message is under the Email field, the sheet stays open and the field keeps its text', async () => {
    routes([anna], { 'POST /api/members': TAKEN })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'cook@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('That email already belongs to a Member, a User or the allowlist.')
    const email = within(dialog).getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toContain(alert.id)
    expect(email).toHaveValue('cook@example.test')
    expect(screen.getByRole('dialog', { name: 'Add Member' })).toBeInTheDocument()
  })

  it('422 validation_failed naming the email: shown under the Email field', async () => {
    routes([anna], { 'POST /api/members': { status: 422, json: { error: { code: 'validation_failed', message: 'email: must look like name@host' } } } })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'a@b.c') // passes the client check; the server disagrees
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(/email/i)
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('an error about something else (a 422 about the name) stays the form\'s own alert, not an email error', async () => {
    routes([anna], { 'POST /api/members': { status: 422, json: { error: { code: 'validation_failed', message: 'name: too long' } } } })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('name: too long')
    expect(within(dialog).getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })

  it('the email error goes away when the Admin edits the field again', async () => {
    routes([anna], { 'POST /api/members': TAKEN })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'cook@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    await within(dialog).findByRole('alert')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'x')
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('the Members list shows each Member\'s email', async () => {
    routes([{ ...anna, email: 'anna@example.test' }, marco])
    renderWithProviders(<MembersPage />)
    expect(await screen.findByText(/anna@example\.test/)).toBeInTheDocument()
  })
})
