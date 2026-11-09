import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { ConversionEditor } from './ConversionEditor'

const garlic = [{ unit: 'clove', toBase: 5 }]

describe('ConversionEditor', () => {
  it('lists conversions as sentences', () => {
    render(<ConversionEditor conversions={garlic} base="g" system="metric" onAdd={() => {}} onRemove={() => {}} />)
    expect(screen.getByText('1 clove = 5 g')).toBeInTheDocument()
  })
  it('shows imperial values but keeps the amount field in the metric Base Unit', () => {
    render(<ConversionEditor conversions={garlic} base="g" system="imperial" onAdd={() => {}} onRemove={() => {}} />)
    expect(screen.getByText('1 clove = 0.2 oz')).toBeInTheDocument()
    expect(screen.getByLabelText(strings.conversionAmountLabel('g'))).toBeInTheDocument()
  })
  it('says when there are none', () => {
    render(<ConversionEditor conversions={[]} base="g" system="metric" onAdd={() => {}} onRemove={() => {}} />)
    expect(screen.getByText(strings.noConversions)).toBeInTheDocument()
  })
  it('removes by unit', async () => {
    const onRemove = vi.fn()
    render(<ConversionEditor conversions={garlic} base="g" system="metric" onAdd={() => {}} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: strings.removeConversion('clove') }))
    expect(onRemove).toHaveBeenCalledWith('clove')
  })
  it('adds a valid conversion and clears the form', async () => {
    const onAdd = vi.fn()
    render(<ConversionEditor conversions={garlic} base="g" system="metric" onAdd={onAdd} onRemove={() => {}} />)
    await userEvent.type(screen.getByLabelText(strings.conversionUnitLabel), ' Bulb ')
    await userEvent.type(screen.getByLabelText(strings.conversionAmountLabel('g')), '50')
    await userEvent.click(screen.getByRole('button', { name: strings.addConversion }))
    expect(onAdd).toHaveBeenCalledWith({ unit: 'bulb', toBase: 50 })
    expect(screen.getByLabelText(strings.conversionUnitLabel)).toHaveValue('')
  })
  it('shows an inline error and does not add an invalid one', async () => {
    const onAdd = vi.fn()
    render(<ConversionEditor conversions={garlic} base="g" system="metric" onAdd={onAdd} onRemove={() => {}} />)
    await userEvent.type(screen.getByLabelText(strings.conversionUnitLabel), 'clove')
    await userEvent.type(screen.getByLabelText(strings.conversionAmountLabel('g')), '6')
    await userEvent.click(screen.getByRole('button', { name: strings.addConversion }))
    expect(screen.getByRole('alert')).toHaveTextContent(strings.errors.unitTaken)
    expect(onAdd).not.toHaveBeenCalled()
  })
})
