// B9-36 (SAFE-02 footer, SAFE-04, SHORT-02): the Member sheet's footer is Cancel and Save Member (bound to the form with the `form`
// attribute), Remove Member sits in the footer as an outlined danger button (the destructive slot: its own row under a divider below 600 px, the far start from 600 px; B9-14 FormActions), there is no Close (R-B), a dirty sheet asks "Discard
// changes?", and a missing Name is explained under Name with focus on it. Remove Member itself only calls `onDelete`: the page asks first
// (screens/MembersPage.remove.test.tsx).
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, marco, sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

// jsdom has no scrollIntoView; useFocusFirstInvalid scrolls the first invalid field into view before focusing it (B9-36 developer).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

const all = [anna, marco, sam]
const open = (props: Record<string, unknown> = {}) => {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onDelete: vi.fn() }
  render(<MemberEditor open users={[]} members={all} member={sam} {...handlers} {...props} />)
  return handlers
}
const dialog = () => screen.getByRole('dialog', { name: /Member$/ })
const footer = () => dialog().querySelector('.sheet__footer') as HTMLElement
const save = () => screen.getByRole('button', { name: 'Save Member' })

describe('the footer', () => {
  it('has Cancel (outline) and Save Member (primary) in the footer, and no Close in the header', () => {
    open()
    expect(within(footer()).getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(footer()).getByRole('button', { name: 'Save Member' })).toHaveAttribute('data-variant', 'primary')
    expect(within(dialog()).queryByRole('button', { name: /^Close/ })).toBeNull()
  })

  it('Save Member is bound to the form: type submit, form attribute, outside the <form> element', () => {
    open()
    const form = dialog().querySelector('form') as HTMLFormElement
    expect(form.id).not.toBe('')
    expect(save()).toHaveAttribute('type', 'submit')
    expect(save()).toHaveAttribute('form', form.id)
    expect(form.contains(save())).toBe(false)
  })

  it('Enter in Name saves, as the footer button does', async () => {
    // user-event only submits on Enter through a submit button inside the <form>; it ignores one bound with the `form` attribute, which
    // real browsers honour (checked in Chrome by the batch reviewer). So: Save Member is the form's submit button, and a submit saves.
    const { onSave } = open({ member: undefined })
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    const form = dialog().querySelector('form') as HTMLFormElement
    expect(Array.from(form.elements)).toContain(save())
    fireEvent.submit(form)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('Remove Member is in the footer, an outlined danger button, and Save Member stays the last button', async () => {
    const { onDelete } = open()
    const buttons = within(footer()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent).sort()).toEqual(['Cancel', 'Remove Member', 'Save Member'])
    expect(buttons[buttons.length - 1]).toHaveTextContent('Save Member')
    const remove = within(footer()).getByRole('button', { name: 'Remove Member' })
    expect(remove).toHaveAttribute('data-variant', 'danger-secondary')
    await userEvent.click(remove)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('Remove Member is not in the form body, so Enter never reaches it', () => {
    open()
    const form = dialog().querySelector('form') as HTMLFormElement
    expect(within(form).queryByRole('button', { name: 'Remove Member' })).toBeNull()
  })

  it('an Add Member sheet has no Remove Member', () => {
    open({ member: undefined, onDelete: undefined })
    expect(screen.queryByRole('button', { name: 'Remove Member' })).toBeNull()
  })

  it('a saving sheet shows the spinner on Save Member and disables it, but Remove Member is disabled too', () => {
    open({ saving: true })
    expect(save()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Member' })).toBeDisabled()
  })
})

describe('leaving a changed sheet', () => {
  it('Cancel on an untouched sheet closes it without a question', async () => {
    const { onClose } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull()
  })

  it('Cancel after a change asks "Discard changes?" with Keep editing focused; Keep editing leaves the sheet open', async () => {
    const { onClose } = open()
    await userEvent.type(screen.getByLabelText('Name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const ask = screen.getByRole('dialog', { name: 'Discard changes?' })
    expect(within(ask).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Discard changes closes the sheet; Escape on a changed sheet asks too', async () => {
    const { onClose } = open()
    await userEvent.type(screen.getByLabelText('Name'), 'x')
    await userEvent.keyboard('{Escape}')
    const ask = screen.getByRole('dialog', { name: 'Discard changes?' })
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(within(ask).getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a change is any field: the Portion Factor stepper counts', async () => {
    const { onClose } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Portion Factor' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a Member who is changed back to what was saved is not a change', async () => {
    const { onClose } = open()
    await userEvent.type(screen.getByLabelText('Name'), 'x')
    await userEvent.type(screen.getByLabelText('Name'), '{Backspace}')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SAFE-04: the Name error is at the field', () => {
  it('Save with no name: aria-invalid on Name, focus on Name, the message under it, no alert, no save', async () => {
    const { onSave } = open({ member: undefined })
    await userEvent.click(save())
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(name).toHaveAccessibleDescription('Enter a name for the Member.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('typing clears the error and the next Save goes through', async () => {
    const { onSave } = open({ member: undefined })
    await userEvent.click(save())
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Nonna')
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('a wrong email: aria-invalid on Email and focus moves to it', async () => {
    open()
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.click(save())
    const email = screen.getByRole('textbox', { name: 'Email' })
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveFocus()
  })

  it('with both wrong, focus goes to the first in the form, Name', async () => {
    open({ member: undefined })
    await userEvent.type(screen.getByLabelText('Email'), 'nope')
    await userEvent.click(save())
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  it('every Save that stays invalid moves focus again (submitCount, not the error text)', async () => {
    open({ member: undefined })
    await userEvent.click(save())
    screen.getByRole('textbox', { name: 'Email' }).focus()
    await userEvent.click(save())
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  it('a server refusal with no field is the form\'s one alert (FormError), above the footer; field errors are never alerts', async () => {
    open({ error: 'The Household needs at least one Admin.' })
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('The Household needs at least one Admin.')
    expect(footer().contains(alerts[0]!)).toBe(false)
  })

  it('a server refusal of the email stays under Email, as before', () => {
    open({ emailError: 'That email already belongs to a Member, a User or the allowlist.' })
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(/already belongs/)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
