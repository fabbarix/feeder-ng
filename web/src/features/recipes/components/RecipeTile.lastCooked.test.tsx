// Beta.5 F7: "Last cooked ..." joins the tile's meta line (Q24).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { summary } from '../fixtures.test-helper'
import { RecipeTile } from './RecipeTile'

describe('RecipeTile last cooked', () => {
  it('says when it was last cooked, in the meta row beside the time', () => {
    const { container } = render(<RecipeTile recipe={summary()} lastCooked="Last cooked yesterday" onOpen={() => {}} />)
    const meta = container.querySelector('.recipe-tile__meta')
    expect(meta).toHaveTextContent('Last cooked yesterday')
    expect(meta).toHaveTextContent('45 min')
  })
  it('says "Not cooked yet" the same way', () => {
    render(<RecipeTile recipe={summary()} lastCooked="Not cooked yet" onOpen={() => {}} />)
    expect(screen.getByText('Not cooked yet')).toBeInTheDocument()
  })
  it('says nothing when it is not given', () => {
    render(<RecipeTile recipe={summary()} onOpen={() => {}} />)
    expect(screen.queryByText(/cooked/i)).toBeNull()
  })
  it('keeps the tile one button', () => {
    render(<RecipeTile recipe={summary()} lastCooked="Last cooked Tue" onOpen={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
