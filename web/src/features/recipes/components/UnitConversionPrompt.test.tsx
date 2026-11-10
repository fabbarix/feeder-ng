import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UnitPrompt } from '../lib/unitPrompt'
import { UnitConversionPrompt } from './UnitConversionPrompt'

const prompt: UnitPrompt = {
  field: 'lines[1].unit', lineIndex: 1, useRef: null, ingredientId: 7, ingredientName: 'garlic', unit: 'clove', baseUnit: 'g',
}
const stepUse: UnitPrompt = { ...prompt, field: 'steps[0].uses[0].unit', lineIndex: null, useRef: [0, 0], unit: 'head' }

describe('UnitConversionPrompt', () => {
  it('is a modal sheet that asks how many Base Units one unit is', () => {
    render(<UnitConversionPrompt prompt={prompt} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Unit Conversion needed' })).toBeInTheDocument()
    expect(screen.getByText('How many g is 1 clove of garlic?')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Amount in g' })).toBeInTheDocument()
  })

  it('asks the same for a unit used in a Step', () => {
    render(<UnitConversionPrompt prompt={stepUse} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('How many g is 1 head of garlic?')).toBeInTheDocument()
  })

  it('saves the typed number', async () => {
    const onSave = vi.fn()
    render(<UnitConversionPrompt prompt={prompt} onSave={onSave} onCancel={() => {}} />)
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Amount in g' }), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Save Unit Conversion' }))
    expect(onSave).toHaveBeenCalledWith(5)
  })

  it('refuses zero or nothing and says why', async () => {
    const onSave = vi.fn()
    render(<UnitConversionPrompt prompt={prompt} onSave={onSave} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Unit Conversion' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a number above 0.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Amount in g' }), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save Unit Conversion' }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('cancels with the button and with Escape', async () => {
    const onCancel = vi.fn()
    render(<UnitConversionPrompt prompt={prompt} onSave={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
