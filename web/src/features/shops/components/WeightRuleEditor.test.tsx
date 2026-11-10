import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { pickOption } from '../../settings/test-utils'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import { WeightRuleEditor } from './WeightRuleEditor'

function setup(over: { initial?: ShopRule; currency?: string } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  render(<WeightRuleEditor currency="USD" onSave={onSave} onCancel={onCancel} {...over} />)
  return { onSave, onCancel, user: userEvent.setup() }
}
const preview = () => screen.getByRole('status')

describe('WeightRuleEditor', () => {
  it('has no native <select> (value kind and unit are Selects)', () => {
    setup()
    expect(document.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: strings.valueKindLabel })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: strings.valueUnitLabel })).toBeInTheDocument()
  })

  it('starts with the common EAN layout and asks for a sample', () => {
    setup()
    expect(screen.getByLabelText(strings.itemStartLabel)).toHaveValue('3')
    expect(screen.getByLabelText(strings.valueStartLabel)).toHaveValue('8')
    expect(preview()).toHaveTextContent(strings.previewIdle)
  })

  it('decodes a sample barcode live with the rule being edited', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    await user.type(screen.getByLabelText(strings.sampleLabel), '2100123007509')
    expect(preview()).toHaveTextContent('Item 00123 · 750 g')
  })

  it('re-reads the sample when the unit or the decimal places change', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    await user.type(screen.getByLabelText(strings.sampleLabel), '2100123007509')
    const dp = screen.getByLabelText(strings.decimalPlacesLabel)
    await user.clear(dp)
    await user.type(dp, '1')
    expect(preview()).toHaveTextContent('Item 00123 · 75 g') // 00750 / 10
    await user.clear(dp)
    await user.type(dp, '3')
    await pickOption(strings.valueUnitLabel, 'kg')
    expect(preview()).toHaveTextContent('Item 00123 · 0.75 kg (750 g)') // 0.750 kg, shown in the rule's unit then grams
  })

  it('reads a price rule in the Household currency', async () => {
    const { user } = setup()
    await pickOption(strings.valueKindLabel, 'price')
    expect(screen.getByRole('combobox', { name: strings.valueUnitLabel })).toHaveTextContent(strings.priceUnit('USD'))
    await user.type(screen.getByLabelText(strings.prefixLabel), '22')
    await user.type(screen.getByLabelText(strings.sampleLabel), '2200123004505')
    expect(preview()).toHaveTextContent('Item 00123 · $4.50')
  })

  it('explains an unreadable sample and a prefix that does not match', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    await user.type(screen.getByLabelText(strings.sampleLabel), '2100123007500')
    expect(preview()).toHaveTextContent(strings.previewInvalid.check_digit)
    await user.clear(screen.getByLabelText(strings.sampleLabel))
    await user.type(screen.getByLabelText(strings.sampleLabel), '2200123004505')
    expect(preview()).toHaveTextContent(strings.previewNoMatch)
  })

  it('cannot be saved while the rule is invalid, and says why', async () => {
    const { user, onSave } = setup()
    expect(screen.getByRole('button', { name: strings.saveRule })).toBeDisabled() // empty prefix
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    expect(screen.getByRole('button', { name: strings.saveRule })).toBeEnabled()
    await user.clear(screen.getByLabelText(strings.valueStartLabel))
    await user.type(screen.getByLabelText(strings.valueStartLabel), '6') // overlaps the item digits
    expect(screen.getByRole('button', { name: strings.saveRule })).toBeDisabled()
    expect(screen.getByText(/overlap/i)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the rule without an id', async () => {
    const { user, onSave } = setup()
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    await pickOption(strings.valueUnitLabel, 'kg')
    const dp = screen.getByLabelText(strings.decimalPlacesLabel)
    await user.clear(dp)
    await user.type(dp, '3')
    await user.click(screen.getByRole('button', { name: strings.saveRule }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 },
        valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3,
      }),
    )
  })

  it('edits an existing rule', () => {
    setup({
      initial: { id: 4, shopId: 1, prefix: '02', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'lb', decimalPlaces: 2 },
    })
    expect(screen.getByLabelText(strings.prefixLabel)).toHaveValue('02')
    expect(screen.getByRole('combobox', { name: strings.valueUnitLabel })).toHaveTextContent('lb')
    expect(screen.getByLabelText(strings.decimalPlacesLabel)).toHaveValue('2')
  })

  it('shows a server refusal', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('a rule with that prefix already exists'))
    const user = userEvent.setup()
    render(<WeightRuleEditor currency="USD" onSave={onSave} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    await user.click(screen.getByRole('button', { name: strings.saveRule }))
    expect(await screen.findByRole('alert')).toHaveTextContent('a rule with that prefix already exists')
  })

  it('cancels', async () => {
    const { user, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: strings.cancel }))
    expect(onCancel).toHaveBeenCalled()
  })
})
