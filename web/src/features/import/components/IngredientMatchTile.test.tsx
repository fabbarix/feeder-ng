import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { match } from '../fixtures.test-helper'
import { importStrings as s } from '../strings'
import { IngredientMatchTile } from './IngredientMatchTile'

const handlers = () => ({ onUseExisting: vi.fn(), onCreate: vi.fn() })

describe('IngredientMatchTile', () => {
  it('says an exact match uses the existing Ingredient', () => {
    render(<IngredientMatchTile match={match({ key: 'onion', name: 'onion', status: 'exact', match: { id: 7, name: 'Onion', baseUnit: 'piece' } })} {...handlers()} />)
    expect(screen.getByText(s.statusExact)).toBeInTheDocument()
    expect(screen.getAllByText('Onion')).toHaveLength(2)
  })
  it('offers each suggestion and create for a similar name', async () => {
    const h = handlers()
    const m = match({
      key: 'chicken thighs', name: 'chicken thighs', status: 'suggested',
      suggestions: [{ id: 3, name: 'chicken thigh', baseUnit: 'g', score: 0.92 }],
    })
    render(<IngredientMatchTile match={m} {...h} />)
    expect(screen.getByText(s.statusSuggested)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: s.createNew })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: s.useExisting('Chicken thigh') }))
    expect(h.onUseExisting).toHaveBeenCalledWith(3)
  })
  it('asks for a Base Unit when the file does not define the Ingredient', async () => {
    const h = handlers()
    render(<IngredientMatchTile match={match({ key: 'lemon', name: 'lemon', status: 'undefined', resolved: false, effective: undefined })} {...h} />)
    expect(screen.getByText(s.statusUndefined)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'piece' }))
    expect(h.onCreate).toHaveBeenCalledWith({ baseUnit: 'piece' })
  })
  it('makes a Base Unit conflict a hand choice: use the existing one or create under another name', async () => {
    const h = handlers()
    const m = match({
      key: 'onion', name: 'onion', status: 'conflict', resolved: false, effective: undefined,
      match: { id: 5, name: 'onion', baseUnit: 'g' }, conflict: { file: 'piece', existing: 'g' },
    })
    render(<IngredientMatchTile match={m} {...h} />)
    expect(screen.getByText(s.conflictText('piece', 'g'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: s.useExisting('Onion') }))
    expect(h.onUseExisting).toHaveBeenCalledWith(5)

    const create = screen.getByRole('button', { name: s.createUnder })
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByLabelText(s.newNameLabel), 'onion (whole)')
    await userEvent.click(create)
    expect(h.onCreate).toHaveBeenCalledWith({ name: 'onion (whole)' })
  })
})
