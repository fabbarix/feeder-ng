import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { pickOption } from '../../settings/test-utils'
import type { AccessMember, AccessRequest } from '../types'
import { ApproveSheet, type ApproveSheetProps } from './ApproveSheet'

const zia: AccessRequest = {
  id: 5, email: 'zia@example.test', name: 'Zia Rosa', picture: '', requestedAt: '2026-11-09T12:00:00Z', expiresAt: '2026-11-23T12:00:00Z',
}
const nonna: AccessMember = { id: 3, name: 'Nonna', userId: null }
const anna: AccessMember = { id: 4, name: 'Anna', userId: null }

function setup(over: Partial<ApproveSheetProps> = {}) {
  const props: ApproveSheetProps = { request: zia, members: [nonna, anna], onApprove: vi.fn(), onCancel: vi.fn(), ...over }
  render(<ApproveSheet {...props} />)
  return props
}

// Decision A3: approving offers "link to Member" in one step. Built on the shared BottomSheet and Select, no native UI.
describe('ApproveSheet', () => {
  it('is a dialog named for the person being approved, and says what approving does', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Approve sign-in request' })
    expect(within(dialog).getByText(/sign in as a user/i)).toBeInTheDocument()
  })

  it('keeps the title short and shows the email in the body line, where it can wrap', () => {
    const long = 'a.very.long.family.member.address.that.never.fits@subdomain.example-household.test'
    setup({ request: { ...zia, email: long } })
    const dialog = screen.getByRole('dialog', { name: 'Approve sign-in request' })
    expect(within(dialog).getByRole('heading', { name: 'Approve sign-in request' })).not.toHaveTextContent(long)
    const line = within(dialog).getByText(/sign in as a user/i)
    expect(line).toHaveTextContent(long)
    expect(line).toHaveClass('access__wrap')
  })

  it('renders nothing when there is no request', () => {
    setup({ request: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers an optional Member picker on the shared Select, with no Member chosen', async () => {
    setup()
    const picker = screen.getByRole('combobox', { name: 'Link to a Member (optional)' })
    expect(picker).toHaveTextContent(/don't link/i)
    await userEvent.click(picker)
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '')
    expect(options.some((t) => t.includes('Nonna'))).toBe(true)
    expect(options.some((t) => t.includes('Anna'))).toBe(true)
    expect(document.querySelector('select')).toBeNull()
  })

  it('approves without a Member when none is picked', async () => {
    const { onApprove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onApprove).toHaveBeenCalledWith(undefined)
  })

  it('approves and links the picked Member in the same step', async () => {
    const { onApprove } = setup()
    await pickOption('Link to a Member (optional)', /Nonna/)
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith(3)
  })

  it('lets the approver undo the pick with "Don\'t link"', async () => {
    const { onApprove } = setup()
    await pickOption('Link to a Member (optional)', /Nonna/)
    await pickOption('Link to a Member (optional)', /don't link/i)
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith(undefined)
  })

  it('cancels with the Cancel button and with Escape, without approving', async () => {
    const { onApprove, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(vi.mocked(onCancel).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('shows a refusal inside the sheet and keeps it open', () => {
    setup({ error: 'That Member already has a User. Pick another, or approve without linking.' })
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(/already has a user/i)
  })

  it('disables the buttons while the approval is being sent', () => {
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('says so, and offers no picker, when every Member already has a User', async () => {
    const { onApprove } = setup({ members: [] })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/every member already has a user/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith(undefined)
  })

  it('still lets the approver approve when the Members could not be loaded', async () => {
    const { onApprove } = setup({ members: [], membersFailed: true })
    expect(screen.getByText(/could not load the members/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith(undefined)
  })
})

// Review nit: a Member who already carries a DIFFERENT email would be linked to a Google account that is not theirs.
// The picker offers Members with no email, or with the requester's own email (any letter case); it never offers the others.
describe('ApproveSheet: Members with an email', () => {
  const names = async () => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Link to a Member (optional)' }))
    return (await screen.findAllByRole('option')).map((o) => o.textContent ?? '')
  }

  it('does not offer a Member who carries a different email', async () => {
    setup({ members: [nonna, { ...anna, email: 'anna@example.test' }] })
    const offered = await names()
    expect(offered.some((t) => t.includes('Nonna'))).toBe(true)
    expect(offered.some((t) => t.includes('Anna'))).toBe(false)
  })

  it('offers a Member whose email is the requester\'s own, whatever the letter case, and one with a null email', async () => {
    setup({ members: [{ ...nonna, email: 'ZIA@Example.test' }, { ...anna, email: null }] })
    const offered = await names()
    expect(offered.some((t) => t.includes('Nonna'))).toBe(true)
    expect(offered.some((t) => t.includes('Anna'))).toBe(true)
  })

  it('says every Member is taken when all of them carry another email', () => {
    setup({ members: [{ ...nonna, email: 'nonna@example.test' }] })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('No Member can be linked to this email.')).toBeInTheDocument()
  })
})

