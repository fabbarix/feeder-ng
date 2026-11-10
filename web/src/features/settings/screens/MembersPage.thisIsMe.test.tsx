// R11a: the Admin links themself to a Member from the Members page (the user's bug). Reads the signed-in User from /api/me
// and the Users from /api/allowlist; Save PATCHes the Member, then PUTs /api/members/:id/user with the Admin's own User id.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { admin, anna, cook, marco, sam } from '../components/fixtures'
import { ADMIN_ME, mockApi, openOptionNames, renderWithProviders } from '../test-utils'
import { MembersPage } from './MembersPage'

const routes = (members = [anna, marco, sam], extra: Record<string, unknown> = {}) =>
  mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/members': members, 'GET /api/allowlist': [admin, cook], ...extra })

describe('MembersPage: the Admin links themself', () => {
  it('offers the Admin\'s own User, and "This is me" links it to the Member being edited', async () => {
    const api = routes([anna, marco, sam], {
      'PATCH /api/members/3': sam,
      'PUT /api/members/3/user': { ...sam, userId: ADMIN_ME.id },
    })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sam' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Member' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Linked User/ }))
    expect(openOptionNames()).toContain('Admin (you)')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'This is me' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/members/3/user')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/members/3/user')[0]!.body).toEqual({ userId: ADMIN_ME.id })
  })

  it('hides "This is me" everywhere once the Admin is linked to a Member, and names no second Member for them', async () => {
    routes([{ ...anna, userId: ADMIN_ME.id }, marco, sam])
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sam' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Member' })
    expect(within(dialog).queryByRole('button', { name: 'This is me' })).toBeNull()
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Linked User/ }))
    expect(openOptionNames().join('|')).not.toMatch(/Admin/)
  })

  it('shows the Admin\'s link on their Member row as "(you)"', async () => {
    routes([{ ...anna, userId: ADMIN_ME.id }, marco, sam])
    renderWithProviders(<MembersPage />)
    const row = await screen.findByRole('button', { name: 'Anna' })
    expect(row).toHaveTextContent(/Admin \(you\)/)
  })
})
