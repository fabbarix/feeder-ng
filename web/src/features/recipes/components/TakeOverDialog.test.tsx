import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'
import { TakeOverDialog } from './TakeOverDialog'

const ask: TakeOverAsk = { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }], stockLots: 1, convertible: true }
const show = (a: TakeOverAsk | null = ask) => {
  const p = { onAnswer: vi.fn(), onCancel: vi.fn() }
  render(<TakeOverDialog ask={a} baseName="Béchamel" {...p} />)
  return p
}

describe('TakeOverDialog (ADR 0015 point 1)', () => {
  it('is closed without an ask', () => {
    show(null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('names the Recipes and the Stock it affects', () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Béchamel (Base recipe) has the name of an Ingredient. Take it over?' })).toBeInTheDocument()
    expect(screen.getByText('Lasagne and Moussaka call for it, and 1 Stock Lot of it is in the Pantry.')).toBeInTheDocument()
  })
  it('explains that the badge tells the Base recipe and the Ingredient apart', () => {
    show()
    expect(screen.getByText(/badge.*tells them apart|tells them apart/)).toBeInTheDocument()
  })
  it('answers Yes and No', async () => {
    const p = show()
    await userEvent.click(screen.getByRole('button', { name: 'Yes, take it over' }))
    expect(p.onAnswer).toHaveBeenLastCalledWith(true)
    await userEvent.click(screen.getByRole('button', { name: 'No, keep it apart' }))
    expect(p.onAnswer).toHaveBeenLastCalledWith(false)
  })
  it('disables Yes with the reason when the Yield unit does not convert; No still works', async () => {
    const p = show({ ...ask, convertible: false })
    expect(screen.getByRole('button', { name: 'Yes, take it over' })).toBeDisabled()
    expect(screen.getByText(/cannot be converted/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'No, keep it apart' }))
    expect(p.onAnswer).toHaveBeenCalledWith(false)
  })
  it('Escape cancels and answers nothing', async () => {
    const p = show()
    await userEvent.keyboard('{Escape}')
    expect(p.onCancel).toHaveBeenCalledOnce()
    expect(p.onAnswer).not.toHaveBeenCalled()
  })
  it('shows the keptLines note when the import has other lines that stay Ingredient lines (beta.8)', () => {
    show({ ...ask, keptLines: 1 })
    expect(screen.getByText('1 other line in this import stays an Ingredient. With Yes it uses Béchamel too; with No it keeps the Ingredient.')).toBeInTheDocument()
  })
  it('shows no note without keptLines (the editor) or with 0', () => {
    show()
    expect(screen.queryByText(/stays? an Ingredient/)).toBeNull()
  })
})
