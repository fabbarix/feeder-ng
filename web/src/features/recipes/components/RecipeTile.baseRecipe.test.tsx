import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { summary } from '../fixtures.test-helper'
import { RecipeTile } from './RecipeTile'

// BR-D: a Base recipe's tile shows the Yield and "Used in 3 Recipes" / "Not used yet" where a plannable tile shows Last cooked.
const base = (over = {}) => summary({ id: 2, name: 'Béchamel', baseRecipe: true, yield: 1, yieldUnit: 'l', usedByCount: 3, courseIds: [], tags: [], totalMinutes: 15, advanceMinutes: 0, ...over })

describe('RecipeTile: Base recipe', () => {
  it('shows the Yield and how many Recipes use it', () => {
    render(<RecipeTile recipe={base()} onOpen={() => {}} />)
    expect(screen.getByText('Yield 1 l')).toBeInTheDocument()
    expect(screen.getByText('Used in 3 Recipes')).toBeInTheDocument()
  })
  it('says "Not used yet" for a Base recipe nobody calls for', () => {
    render(<RecipeTile recipe={base({ usedByCount: 0 })} onOpen={() => {}} />)
    expect(screen.getByText('Not used yet')).toBeInTheDocument()
  })
  it('shows the Base recipe badge and no Last cooked line, even when one is given', () => {
    render(<RecipeTile recipe={base()} onOpen={() => {}} lastCooked="Last cooked yesterday" />)
    expect(screen.getByText('Base recipe')).toBeInTheDocument()
    expect(screen.queryByText(/Last cooked/)).toBeNull()
  })
  it('keeps the total time', () => {
    render(<RecipeTile recipe={base()} onOpen={() => {}} />)
    expect(screen.getByText('15 min')).toBeInTheDocument()
  })
  it('a plannable tile shows neither the Yield line nor the badge', () => {
    render(<RecipeTile recipe={summary()} onOpen={() => {}} lastCooked="Last cooked yesterday" />)
    expect(screen.queryByText(/^Yield /)).toBeNull()
    expect(screen.queryByText('Base recipe')).toBeNull()
    expect(screen.getByText('Last cooked yesterday')).toBeInTheDocument()
  })
})
