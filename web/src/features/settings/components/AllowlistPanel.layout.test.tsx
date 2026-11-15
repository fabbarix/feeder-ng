// F-02 (docs/design/ui-review-2.md): the Allowlist page was broken. "Email to allow" collapsed to 83 px beside its button,
// phone rows overflowed the card (the email missing, "Rem..." clipped), and every checkbox repeated the email. Redesign on the
// shared primitives (TextField, Button, ListRow, Switch, IconButton), no native controls:
//   - the add form is `.allowlist__add`: a TextField (class hook `.allowlist__field`) plus "Add to allowlist"; the hint
//     "People can also ask to join" with a link to Sign-in requests sits under it; the server's refusal (409 email_taken,
//     `addError`) is shown under the field.
//   - a row is a ListRow: title = the email (once), meta = "You", "Last Admin" or "You · Last Admin", trailing = a Switch
//     visibly labelled "Admin" (aria-label "Admin: <email>") and an IconButton "Remove <email>" (no visible text to clip).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { memberEmailProblem } from '../lib/memberForm'
import { admin, cook } from './fixtures'
import { AllowlistPanel, type AllowlistPanelProps } from './AllowlistPanel'

function setup(over: Partial<AllowlistPanelProps> = {}) {
  const props: AllowlistPanelProps = { users: [admin, cook], currentUserId: 1, onAdd: vi.fn().mockResolvedValue(undefined), onSetAdmin: vi.fn(), onRemove: vi.fn(), ...over }
  const view = render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AllowlistPanel {...props} />
        </ConfirmProvider>
      </ToastProvider>
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
    const error = screen.getByText(message).closest('p')!
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
    expect(error.closest('.allowlist__field')).not.toBeNull()
    await userEvent.type(input, 'x')
    expect(input).toHaveValue('x')
  })

  it('a general error stays a separate alert and does not mark the field', () => {
    setup({ error: 'The Household needs at least one Admin.' })
    // B9-52: the panel's one alert is a <FormError> (the ToastProvider's own live region is not it)
    const alert = screen.getByText(/at least one Admin/).closest('[role="alert"]')!
    expect(alert).toHaveClass('form-error')
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

  it('Remove is an icon button named "Remove <email>" with no visible text (no share sheet: it sits beside Copy)', () => {
    setup()
    const row = screen.getByText('cook@example.test').closest('li')!
    const remove = within(row).getByRole('button', { name: 'Remove cook@example.test' })
    expect(remove.textContent).toBe('')
    expect(remove.querySelector('svg')).not.toBeNull()
  })

  // B9-52 (SET-03, main-session ruling): your row reads "You · Admin · Last Admin" (the parts that apply); another row reads the
  // User's display name once they have signed in, else "Not signed in yet". No Chip.
  it('meta: "You · Admin · Last Admin" on your row, the display name or "Not signed in yet" on the others; no Chip is used', () => {
    const second = { ...cook, id: 3, email: 'third@example.test', displayName: 'third', signedIn: false }
    setup({ users: [admin, cook, second] })
    expect(within(screen.getByText('admin@example.test').closest('li')!).getByText('You · Admin · Last Admin')).toBeInTheDocument()
    expect(within(screen.getByText('cook@example.test').closest('li')!).getByText('Cook')).toBeInTheDocument()
    expect(within(screen.getByText('cook@example.test').closest('li')!).queryByText(/You|Last Admin/)).toBeNull()
    expect(within(screen.getByText('third@example.test').closest('li')!).getByText('Not signed in yet')).toBeInTheDocument()
    expect(document.querySelector('.chip')).toBeNull()
  })

  it('your row as a plain User reads "You"; with two Admins your row reads "You · Admin"', () => {
    setup({ users: [admin, { ...cook, isAdmin: true }], currentUserId: 1 })
    expect(within(screen.getByText('admin@example.test').closest('li')!).getByText('You · Admin')).toBeInTheDocument()
  })

  it('another row that is the Last Admin (someone else is signed in) reads its name and "Last Admin"', () => {
    setup({ currentUserId: 2 })
    expect(within(screen.getByText('admin@example.test').closest('li')!).getByText('Admin · Last Admin')).toBeInTheDocument()
    expect(within(screen.getByText('cook@example.test').closest('li')!).getByText('You')).toBeInTheDocument()
  })

  it('the row has one controls wrapper that cannot shrink away (.allowlist__actions), in the ListRow actions slot (B9-52)', () => {
    setup()
    const row = screen.getByText('cook@example.test').closest('li')!
    const actions = row.querySelector('.allowlist__actions')!
    expect(actions).not.toBeNull()
    expect(actions.closest('.list-row__actions')).not.toBeNull()
    expect(actions.closest('.list-row__trailing')).toBeNull()
    expect(row).toHaveAttribute('data-actions', 'true')
    expect(within(actions as HTMLElement).getAllByRole('switch')).toHaveLength(1)
    expect(within(actions as HTMLElement).getAllByRole('button')).toHaveLength(2) // Copy sign-in message, Remove
  })
})

describe('AllowlistPanel: review send-back', () => {
  it('"Add to allowlist" is a secondary Button (design 13.4)', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Add to allowlist' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('the rows sit in .allowlist__list, the hook of the phone rules (the email wraps on a phone)', () => {
    const { container } = setup()
    const list = container.querySelector('.allowlist__list')
    expect(list).not.toBeNull()
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2)
  })

  it('an invalid email reads exactly as it does in the Member sheet', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Email to allow'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    const expected = memberEmailProblem('nope')
    expect(expected).toMatch(/email/i)
    await waitFor(() => expect(screen.getByLabelText('Email to allow')).toHaveAccessibleDescription(expect.stringContaining(expected!)))
  })
})

