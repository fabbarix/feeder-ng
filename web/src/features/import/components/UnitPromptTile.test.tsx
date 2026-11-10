import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { prompt } from '../fixtures.test-helper'
import { importStrings as s } from '../strings'
import { UnitPromptTile } from './UnitPromptTile'

describe('UnitPromptTile', () => {
  it('asks how much one unit is, in the Base Unit', () => {
    render(<UnitPromptTile prompt={prompt()} onAnswer={vi.fn()} />)
    expect(screen.getByText(s.unitPrompt('handful', 'spinach'))).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: s.unitAmountLabel('g') })).toBeInTheDocument()
  })
  it('saves a valid amount', async () => {
    const onAnswer = vi.fn()
    render(<UnitPromptTile prompt={prompt()} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByRole('spinbutton', { name: s.unitAmountLabel('g') }), '30')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: s.saveConversion }))
    expect(onAnswer).toHaveBeenCalledWith(30)
  })
  it.each(['0', '-2'])('refuses %j and says why', async (text) => {
    const onAnswer = vi.fn()
    render(<UnitPromptTile prompt={prompt()} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByRole('spinbutton', { name: s.unitAmountLabel('g') }), text)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: s.saveConversion })).toBeDisabled()
    expect(screen.getByText(s.conversionInvalid)).toBeInTheDocument()
    expect(onAnswer).not.toHaveBeenCalled()
  })
  it('shows an answered prompt with its value', () => {
    render(<UnitPromptTile prompt={prompt({ answered: true, toBase: 30 })} onAnswer={vi.fn()} />)
    expect(screen.getByText(/30/)).toBeInTheDocument()
  })
})
