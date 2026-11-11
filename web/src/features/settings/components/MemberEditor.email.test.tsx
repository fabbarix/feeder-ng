// A1 phase 2 (docs/dev/design/a1-access-requests.md 2.6, 7): the Member sheet gets an optional Email field.
// A Member with an email can sign in with Google without asking (an Access Request is skipped). The field is a shared
// TextField (type email) with the helper "Lets them sign in with Google without asking". It is optional, sent as
// `email` (null when empty), and a server refusal (422 validation_failed, 409 email_taken) is shown inline under the field.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, marco } from './fixtures'
import { MemberEditor, type MemberEditorProps } from './MemberEditor'

const users = [{ id: 2, displayName: 'Cook', email: 'cook@example.test' }]
const withEmail = { ...anna, email: 'anna@example.test' }

function open(over: Partial<MemberEditorProps> = {}) {
  const onSave = vi.fn()
  render(<MemberEditor open users={users} members={[anna, marco]} onSave={onSave} onClose={() => {}} {...over} />)
  return onSave
}

describe('MemberEditor: Email', () => {
  it('has an optional Email field of type email, with the helper, described by it', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    const input = within(dialog).getByLabelText('Email')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).not.toHaveAttribute('aria-required')
    expect(input).toHaveValue('')
    const helper = within(dialog).getByText('Lets them sign in with Google without asking')
    expect(helper).toBeVisible()
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining(helper.id))
  })

  it('sits between Portion Factor and Linked User', () => {
    open()
    const at = (t: string) => screen.getAllByText(new RegExp(`^${t}`))[0]!
    const follows = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(at('Portion Factor'), at('Email'))).toBe(true)
    expect(follows(at('Email'), at('Linked User'))).toBe(true)
  })

  it('shows the Member\'s email when editing, and an empty field when they have none', () => {
    open({ member: withEmail })
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.test')
  })

  it('an existing Member without an email starts empty (email: null)', () => {
    open({ member: { ...anna, email: null } })
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })

  it('saves the typed email in the input, trimmed', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.type(screen.getByLabelText('Email'), '  nonna@example.test ')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0]).toMatchObject({ name: 'Nonna', email: 'nonna@example.test' })
  })

  it('saves email: null when left empty or blank (the server clears it)', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.type(screen.getByLabelText('Email'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave.mock.calls[0]![0].email).toBeNull()
  })

  it('clearing a Member\'s email on edit saves null', async () => {
    const onSave = open({ member: withEmail })
    await userEvent.clear(screen.getByLabelText('Email'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave.mock.calls[0]![0].email).toBeNull()
  })

  it('refuses something that is not an address, inline under the field, without saving', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.type(screen.getByLabelText('Email'), 'nonna')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).not.toHaveBeenCalled()
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/email/i)
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id)
  })

  it('shows a server refusal for the email inline under the field (emailError), not as the form alert', () => {
    open({ emailError: 'That email already belongs to a Member, a User or the allowlist.' })
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('That email already belongs to a Member, a User or the allowlist.')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('has no email error until there is one', () => {
    open()
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uses no native select and the field is not required', () => {
    open()
    expect(document.querySelector('select')).toBeNull()
    expect(screen.getByLabelText('Email')).not.toBeRequired()
  })
})
