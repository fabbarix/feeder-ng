// B9-36 (SAFE-02, decision SAFE 4): Remove Member asks first (what goes, as rows), then removes and shows an Undo toast. Chapter scenarios,
// by title: "Removing a Member asks first and lists what goes"; "Undo puts a removed Member back". The API half is
// bdd/features/household/removals.feature (B9-04). The confirm copy itself is pinned in lib/memberRemoval.test.ts.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { admin, anna, cook, marco, sam } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { MembersPage } from './MembersPage'

afterEach(() => vi.unstubAllGlobals())

const IMPACT = { preferences: 3, mealSlots: 21, signIn: null }

function setup(extra: Record<string, unknown> = {}, impact: unknown = IMPACT) {
  let members = [anna, marco, sam]
  const api = mockApi({
    'GET /api/me': ADMIN_ME,
    'GET /api/members': () => members,
    'GET /api/allowlist': [admin, cook],
    [`GET /api/members/${sam.id}/impact`]: impact,
    [`DELETE /api/members/${sam.id}`]: () => {
      members = members.filter((m) => m.id !== sam.id)
      return { status: 204 }
    },
    [`POST /api/members/${sam.id}/restore`]: () => {
      members = [anna, marco, sam]
      return sam
    },
    ...extra,
  })
  return api
}

async function askToRemoveSam() {
  await userEvent.click(await screen.findByRole('button', { name: /Sam/ }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Member' })).getByRole('button', { name: 'Remove Member' }))
  return screen.findByRole('dialog', { name: 'Remove Sam?' })
}

describe('Removing a Member asks first and lists what goes', () => {
  it('reads the impact, then opens a danger dialog with the rows; nothing is deleted yet', async () => {
    const api = setup()
    renderWithProviders(<MembersPage />)
    const ask = await askToRemoveSam()
    expect(api.callsTo('GET', `/api/members/${sam.id}/impact`)).toHaveLength(1)
    expect(api.callsTo('DELETE', `/api/members/${sam.id}`)).toHaveLength(0)
    expect(within(ask).getByText('Sam no longer counts towards portions.')).toBeInTheDocument()
    expect(within(ask).getByText('Goes with Sam')).toBeInTheDocument()
    expect(within(ask).getByText('Preferences')).toBeInTheDocument()
    expect(within(ask).getByText('21 Meal Slots')).toBeInTheDocument()
    expect(within(ask).queryByText('Sign-in')).toBeNull()
    expect(within(ask).getByText(/Planned Meals from today are worked out again/)).toBeInTheDocument()
  })

  it('Cancel is focused, there is no Close, and Cancel leaves the Member and the sheet as they were', async () => {
    const api = setup()
    renderWithProviders(<MembersPage />)
    const ask = await askToRemoveSam()
    expect(within(ask).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(ask).queryByRole('button', { name: /^Close/ })).toBeNull()
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(api.callsTo('DELETE', `/api/members/${sam.id}`)).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Edit Member' })).toBeInTheDocument()
  })

  it('draws the Sign-in row when the sign-in ends', async () => {
    setup({}, { ...IMPACT, signIn: { email: 'sam@example.com' } })
    renderWithProviders(<MembersPage />)
    const ask = await askToRemoveSam()
    expect(within(ask).getByText('Sign-in')).toBeInTheDocument()
    expect(within(ask).getByText('sam@example.com · not on the Allowlist')).toBeInTheDocument()
  })

  it('names the removal on its confirm button: "Remove Sam"', async () => {
    setup()
    renderWithProviders(<MembersPage />)
    const ask = await askToRemoveSam()
    expect(within(ask).getByRole('button', { name: 'Remove Sam' })).toBeInTheDocument()
  })

  it('a failed impact read removes nothing and says so', async () => {
    const api = setup({ [`GET /api/members/${sam.id}/impact`]: { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Sam/ }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Member' })).getByRole('button', { name: 'Remove Member' }))
    await waitFor(() => expect(api.callsTo('GET', `/api/members/${sam.id}/impact`)).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: 'Remove Sam?' })).toBeNull()
    expect(api.callsTo('DELETE', `/api/members/${sam.id}`)).toHaveLength(0)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('Remove, then Undo', () => {
  it('Remove Sam deletes once, closes the sheet, shows "Sam removed" with an Undo, and focuses the Members heading', async () => {
    const api = setup()
    renderWithProviders(<MembersPage />)
    const ask = await askToRemoveSam()
    await userEvent.click(within(ask).getByRole('button', { name: 'Remove Sam' }))
    await waitFor(() => expect(api.callsTo('DELETE', `/api/members/${sam.id}`)).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const toast = await findToast('Sam removed')
    expect(toast.querySelector('.toast__title svg')).toBeNull() // no status icon
    expect(within(toast).getByRole('button', { name: 'Undo: put Sam back' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Members' })).toHaveFocus()
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Sam/ })).toBeNull())
  })

  it('Undo restores Sam once, shows "Sam is back" and the list has Sam again', async () => {
    const api = setup()
    renderWithProviders(<MembersPage />)
    await userEvent.click(within(await askToRemoveSam()).getByRole('button', { name: 'Remove Sam' }))
    const toast = await findToast('Sam removed')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo: put Sam back' }))
    await waitFor(() => expect(api.callsTo('POST', `/api/members/${sam.id}/restore`)).toHaveLength(1))
    expect(await findToast('Sam is back')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Sam/ })).toBeInTheDocument()
  })

  it('a second press of Undo does not restore twice', async () => {
    const api = setup()
    renderWithProviders(<MembersPage />)
    await userEvent.click(within(await askToRemoveSam()).getByRole('button', { name: 'Remove Sam' }))
    const undo = within(await findToast('Sam removed')).getByRole('button', { name: 'Undo: put Sam back' })
    await userEvent.dblClick(undo)
    await findToast('Sam is back')
    expect(api.callsTo('POST', `/api/members/${sam.id}/restore`)).toHaveLength(1)
  })

  it('Undo refused because the email was taken meanwhile: "Nothing was undone" and the reason', async () => {
    setup({ [`POST /api/members/${sam.id}/restore`]: { status: 409, json: { error: { code: 'email_taken', message: 'x' } } } })
    renderWithProviders(<MembersPage />)
    await userEvent.click(within(await askToRemoveSam()).getByRole('button', { name: 'Remove Sam' }))
    await userEvent.click(within(await findToast('Sam removed')).getByRole('button', { name: 'Undo: put Sam back' }))
    const refused = await findToast('Nothing was undone')
    expect(refused).toHaveTextContent('That email is already used by someone else.')
  })

  it('Undo after the ten minutes (404): "Nothing was undone", it was already undone', async () => {
    setup({ [`POST /api/members/${sam.id}/restore`]: { status: 404, json: { error: { code: 'not_found', message: 'x' } } } })
    renderWithProviders(<MembersPage />)
    await userEvent.click(within(await askToRemoveSam()).getByRole('button', { name: 'Remove Sam' }))
    await userEvent.click(within(await findToast('Sam removed')).getByRole('button', { name: 'Undo: put Sam back' }))
    expect(await findToast('Nothing was undone')).toHaveTextContent('It was already undone.')
  })

  it('a refused removal (the last Admin) keeps the sheet open with the reason as the form error, and shows no Undo', async () => {
    setup({ [`DELETE /api/members/${sam.id}`]: { status: 409, json: { error: { code: 'last_admin', message: 'x' } } } })
    renderWithProviders(<MembersPage />)
    await userEvent.click(within(await askToRemoveSam()).getByRole('button', { name: 'Remove Sam' }))
    expect(await within(await screen.findByRole('dialog', { name: 'Edit Member' })).findByRole('alert')).toHaveTextContent('The Household needs at least one Admin.')
    expect(document.querySelector('.toast')).toBeNull()
  })
})
