// B5-BOW: the Swap sheet notes what stays in Stock when the swapped meal is Bought.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { slot } from '../test-utils'
import type { BoughtInfo } from '../lib/bought'
import { SwapSheet } from './SwapSheet'

const alternatives = [{ recipeId: 1, recipeName: 'Stew', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, why: [] }]
const bought: BoughtInfo = { ingredients: [{ id: 1, name: 'chicken thighs' }, { id: 2, name: 'cream' }] }
const open = (b?: BoughtInfo | null) =>
  render(<SwapSheet open onClose={() => {}} slot={slot()} alternatives={alternatives} isLoading={false} onPick={() => {}} bought={b} />)

describe('SwapSheet: Bought note', () => {
  it('says what was bought and that it stays in Stock', () => {
    open(bought)
    expect(screen.getByText('You bought chicken thighs, cream for this; it stays in Stock.')).toBeInTheDocument()
  })
  it('shows no note when not Bought', () => {
    open(null)
    expect(screen.queryByText(/You bought/)).not.toBeInTheDocument()
  })
  it('shows no note when the prop is absent or the list empty', () => {
    open({ ingredients: [] })
    expect(screen.queryByText(/You bought/)).not.toBeInTheDocument()
  })
})
