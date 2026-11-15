// B9-30 (SHORT-02, SAFE-04, A11Y): the Weight Barcode Rule sheet.
//   - its visible "Item code" and "Value" labels are the groups' only announcement: a screen reader does not hear each name twice (once as
//     a heading, once as the group). So no heading of those names; the group (role=group) carries the name, labelled by the visible text.
//   - Cancel and Save rule are the footer (B9-14); no Close; Save is bound to the form.
//   - Save with a bad rule marks the field aria-invalid, focuses it and shows the message under it (no role=alert for it); a server
//     failure is a FormError (role=alert, class form-error), not `.pg__error`.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { WeightRuleEditor } from './WeightRuleEditor'

const setup = (onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(<WeightRuleEditor currency="USD" onSave={onSave} onCancel={vi.fn()} />)
  return { onSave }
}

describe('WeightRuleEditor names (A11Y)', () => {
  it('"Item code" and "Value" are group names only, never headings too', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    const headings = within(dialog).queryAllByRole('heading').map((h) => h.textContent)
    expect(headings).not.toContain(strings.itemCodeGroup)
    expect(headings).not.toContain(strings.valueGroup)
    expect(within(dialog).getByRole('group', { name: strings.itemCodeGroup })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: strings.valueGroup })).toBeInTheDocument()
  })

  it('the visible label is still there, once each, and is the group\'s own name', () => {
    setup()
    const group = screen.getByRole('group', { name: strings.itemCodeGroup })
    expect(screen.getAllByText(strings.itemCodeGroup)).toHaveLength(1)
    expect(screen.getByText(strings.itemCodeGroup)).toBeVisible()
    const labelId = group.getAttribute('aria-labelledby')
    expect(labelId ? document.getElementById(labelId)?.textContent : group.querySelector('legend')?.textContent).toBe(strings.itemCodeGroup)
  })

  it('the footer is Cancel and the bound Save rule, with no Close', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /^close$/i })).toBeNull()
    expect(within(dialog).getByRole('button', { name: strings.cancel })).toHaveAttribute('data-variant', 'secondary')
    expect(within(dialog).getByRole('button', { name: strings.saveRule })).toHaveAttribute('type', 'submit')
  })
})

describe('WeightRuleEditor errors (SAFE-04)', () => {
  it('a missing prefix is the Prefix field\'s error: invalid, focused, described, not an alert', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('button', { name: strings.saveRule }))
    const prefix = screen.getByLabelText(strings.prefixLabel)
    expect(prefix).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(prefix).toHaveFocus())
    const message = screen.getByText('Enter the prefix as digits, for example 21.')
    expect(prefix.getAttribute('aria-describedby') ?? '').toContain(message.id)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a blank number is that field\'s error, never a loose paragraph', async () => {
    setup()
    await userEvent.type(screen.getByLabelText(strings.prefixLabel), '21')
    await userEvent.clear(screen.getByLabelText(strings.valueLengthLabel))
    await userEvent.click(screen.getByRole('button', { name: strings.saveRule }))
    expect(screen.getByLabelText(strings.valueLengthLabel)).toHaveAttribute('aria-invalid', 'true')
    expect(document.querySelector('.pg__error')).toBeNull()
  })

  it('a server failure is a FormError', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('This Shop already has a rule with that prefix.'))
    setup(onSave)
    await userEvent.type(screen.getByLabelText(strings.prefixLabel), '21')
    await userEvent.click(screen.getByRole('button', { name: strings.saveRule }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(alert).toHaveTextContent('This Shop already has a rule with that prefix.')
    expect(document.querySelector('.pg__error')).toBeNull()
  })
})
