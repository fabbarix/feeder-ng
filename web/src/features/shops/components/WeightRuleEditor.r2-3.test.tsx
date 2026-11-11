// R2-3 (F-08, F-01, F-04): the Add rule form was 10 full-width fields with an error shown before anything was typed.
//   - Prefix sm; two FieldRows of xs fields, named groups "Item code" (start, length) and "Value" (start, length, decimal places).
//   - Value kind and Unit sit on one row (Selects, md).
//   - Validation on submit only: no error text and an ENABLED Save while untouched; Save with an empty prefix shows the reason and
//     does not call onSave.
//   - Save rule / Cancel in FormActions.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { WeightRuleEditor } from './WeightRuleEditor'

function setup() {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<WeightRuleEditor currency="USD" onSave={onSave} onCancel={vi.fn()} />)
  return { onSave }
}
const sizeOf = (el: HTMLElement) => el.closest('[data-size]')?.getAttribute('data-size')

describe('WeightRuleEditor layout (F-08)', () => {
  it('sizes the numeric fields xs and the prefix sm', () => {
    setup()
    expect(sizeOf(screen.getByLabelText(strings.prefixLabel))).toBe('sm')
    for (const label of [strings.itemStartLabel, strings.itemLengthLabel, strings.valueStartLabel, strings.valueLengthLabel, strings.decimalPlacesLabel]) {
      expect(sizeOf(screen.getByLabelText(label))).toBe('xs')
    }
  })

  it('groups the item code positions and the value positions in two named FieldRows', () => {
    setup()
    const item = screen.getByRole('group', { name: 'Item code' })
    const value = screen.getByRole('group', { name: 'Value' })
    expect(item).toHaveClass('field-row')
    expect(value).toHaveClass('field-row')
    expect(within(item).getByLabelText(strings.itemStartLabel)).toBeInTheDocument()
    expect(within(item).getByLabelText(strings.itemLengthLabel)).toBeInTheDocument()
    expect(within(value).getByLabelText(strings.valueStartLabel)).toBeInTheDocument()
    expect(within(value).getByLabelText(strings.valueLengthLabel)).toBeInTheDocument()
    expect(within(value).getByLabelText(strings.decimalPlacesLabel)).toBeInTheDocument()
  })
})

describe('WeightRuleEditor validation and actions (F-08, F-04)', () => {
  it('shows no error and keeps Save enabled before anything is typed', () => {
    setup()
    expect(document.querySelector('.pg__error')).toBeNull()
    expect(screen.queryByText(/prefix/i, { selector: 'p' })).toBeNull()
    expect(screen.getByRole('button', { name: strings.saveRule })).toBeEnabled()
  })

  it('shows the reason on submit with an empty prefix, and does not save', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('button', { name: strings.saveRule }))
    expect(document.querySelector('.pg__error, [role=alert]')).not.toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('puts Save rule and Cancel in FormActions', () => {
    setup()
    expect(screen.getByRole('button', { name: strings.saveRule }).closest('.form-actions__primary')).not.toBeNull()
    expect(screen.getByRole('button', { name: strings.cancel }).closest('.form-actions__tertiary')).not.toBeNull()
  })
})
