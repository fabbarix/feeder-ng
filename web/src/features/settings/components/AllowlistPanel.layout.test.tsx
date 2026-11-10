// F-02 (docs/design/ui-review-2.md): the Allowlist page was broken. "Email to allow" collapsed to 83 px beside its button,
// phone rows overflowed the card (the email missing, "Rem..." clipped), and every checkbox repeated the email. Redesign on the
// shared primitives (TextField, Button, ListRow, Switch, IconButton), no native controls:
//   - the add form is `.allowlist__add`: a TextField (class hook `.allowlist__field`) plus "Add to allowlist"; the hint
//     "People can also ask to join" with a link to Sign-in requests sits under it; the server's refusal (409 email_taken,
//     `addError`) is shown under the field.
//   - a row is a ListRow: title = the email (once), meta = "You", "Last Admin" or "You · Last Admin", trailing = a Switch
//     visibly labelled "Admin" (aria-label "Admin: <email>") and an IconButton "Remove <email>" (no visible text to clip).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { admin, cook } from './fixtures'
import { AllowlistPanel, type AllowlistPanelProps } from './AllowlistPanel'

function setup(over: Partial<AllowlistPanelProps> = {}) {
  const props: AllowlistPanelProps = { users: [admin, cook], currentUserId: 1, onAdd: vi.fn().mockResolvedValue(undefined), onSetAdmin: vi.fn(), onRemove: vi.fn(), ...over }
  const view = render(
    <MemoryRouter>
      <ConfirmProvider>
        <AllowlistPanel {...props} />
      </ConfirmProvider>
    </MemoryRouter>,
  )
  return { props, ...view }
}

describe('AllowlistPanel: add form', () => {
  it('is a form with the email field and the button as siblings in .allowlist__add, the field in .allowlist__field', () => {
    const { container } = setup()
    const form = container.querySelector('form.allowlist__add')!
    expect(form).not.toBeNull()
    const input = within(form as HTMLElement).getByLabelText('Email to allow')
    expect(input.closest('.allowlist__field')).not.toBeNull()
    expect(input).toHaveAttribute('type', 'email')
    expect(within(form as HTMLElement).getByRole('button', { name: 'Add to allowlist' })).toBeInTheDocument()
    expect(container.querySelector('.settings__row--wrap-start')).toBeNull() // the old shrinking flex row is gone
  })

  it('says people can also ask to join, and links to the Sign-in requests page', () => {
    setup()
    expect(screen.getByText(/People can also ask to join/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign-in requests' })).toHaveAttribute('href', '/settings/access-requests')
  })

  it('shows addError under the field (aria-invalid, described by the message), keeping the typed text', async () => {
    const message = 'That email already belongs to a Member, a User or the allowlist.'
    setup({ addError: message })
    const input = screen.getByLabelText('Email to allow')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    expect(alert.closest('.allowlist__field')).not.toBeNull()
    await userEvent.type(input, 'x')
    expect(input).toHaveValue('x')
  })

  it('a general error stays a separate alert and does not mark the field', () => {
    setup({ error: 'The Household needs at least one Admin.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one Admin/)
    expect(screen.getByLabelText('Email to allow')).not.toHaveAttribute('aria-invalid')
  })

  it('uses no native select, checkbox or fieldset', () => {
    const { container } = setup()
    expect(container.querySelector('select, fieldset, input[type="checkbox"]')).toBeNull()
  })
})

describe('AllowlistPanel: rows', () => {
  it('shows each email exactly once as visible text (the controls name themselves without repeating it)', () => {
    setup()
    for (const row of screen.getAllByRole('listitem')) {
      const email = row.querySelector('.list-row__title')!.textContent!
      expect(email).toMatch(/@example\.test$/)
      expect(row.textContent!.split(email).length - 1, email).toBe(1)
    }
  })

  it('has a switch visibly labelled "Admin" and announced as "Admin: <email>"', () => {
    setup()
    const row = screen.getByText('cook@example.test').closest('li')!
    expect(within(row).getByText('Admin')).toBeVisible()
    expect(within(row).getByRole('switch', { name: 'Admin: cook@example.test' })).toBeInTheDocument()
    expect(within(row).queryByRole('checkbox')).toBeNull()
  })

  it('Remove is an icon button named "Remove <email>" with no visible text', () => {
    setup()
    const row = screen.getByText('cook@example.test').closest('li')!
    const remove = within(row).getByRole('button', { name: 'Remove cook@example.test' })
    expect(remove.textContent).toBe('')
    expect(remove.querySelector('svg')).not.toBeNull()
  })

  it('meta is one line: "You", "Last Admin", both, or nothing; no Chip is used', () => {
    const second = { ...cook, id: 3, email: 'third@example.test' }
    setup({ users: [admin, cook, second] })
    expect(within(screen.getByText('admin@example.test').closest('li')!).getByText('You · Last Admin')).toBeInTheDocument()
    expect(within(screen.getByText('cook@example.test').closest('li')!).queryByText(/You|Last Admin/)).toBeNull()
    expect(document.querySelector('.chip')).toBeNull()
  })

  it('a row that is only "Last Admin" (someone else is signed in) reads "Last Admin"', () => {
    setup({ currentUserId: 2 })
    expect(within(screen.getByText('admin@example.test').closest('li')!).getByText('Last Admin')).toBeInTheDocument()
  })

  it('the row has one controls wrapper that cannot shrink away (.allowlist__actions)', () => {
    setup()
    const row = screen.getByText('cook@example.test').closest('li')!
    const actions = row.querySelector('.allowlist__actions')!
    expect(actions).not.toBeNull()
    expect(within(actions as HTMLElement).getAllByRole('switch')).toHaveLength(1)
    expect(within(actions as HTMLElement).getAllByRole('button')).toHaveLength(1) // Remove
  })
})
