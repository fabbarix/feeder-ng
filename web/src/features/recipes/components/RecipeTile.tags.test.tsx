// TG-RW: Tags on the Recipe tile: the first two in their colours, then "+N" (docs/dev/design/tg-rw.md 3).
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { summary } from '../fixtures.test-helper'
import { RecipeTile } from './RecipeTile'

const colours: Record<string, string> = { roast: 'tomato', quick: 'sage' }
const colourOf = (n: string) => colours[n]
const tagItems = () => within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem')

describe('RecipeTile Tags', () => {
  it('shows the first two Tags and "+N" for the rest', () => {
    render(<RecipeTile recipe={summary({ tags: ['roast', 'quick', 'sweet', 'kids'] })} colourOf={colourOf} onOpen={() => {}} />)
    expect(tagItems().map((li) => li.textContent)).toEqual(['roast', 'quick', '+2'])
  })
  it('colours the shown Tags', () => {
    render(<RecipeTile recipe={summary({ tags: ['roast', 'quick'] })} colourOf={colourOf} onOpen={() => {}} />)
    const colourOfItem = (li: HTMLElement) => li.querySelector('.chip')?.getAttribute('data-tag-colour')
    expect(tagItems().map(colourOfItem)).toEqual(['tomato', 'sage'])
  })
  it('shows one Tag alone, with no "+N"', () => {
    render(<RecipeTile recipe={summary({ tags: ['roast'] })} colourOf={colourOf} onOpen={() => {}} />)
    expect(tagItems().map((li) => li.textContent)).toEqual(['roast'])
  })
  it('shows no Tags list for a Recipe without Tags', () => {
    render(<RecipeTile recipe={summary({ tags: [] })} colourOf={colourOf} onOpen={() => {}} />)
    expect(screen.queryByRole('list', { name: 'Tags' })).toBeNull()
  })
  it('keeps the tile one button (the Tag chips are not interactive)', () => {
    render(<RecipeTile recipe={summary({ tags: ['roast', 'quick', 'sweet'] })} courseNames={['Main']} colourOf={colourOf} onOpen={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
  it('keeps the photo-less thumb on the accent tone: it takes no Tag colour', () => {
    const { container } = render(<RecipeTile recipe={summary({ tags: ['roast'] })} colourOf={colourOf} onOpen={() => {}} />)
    expect(container.querySelector('.recipe-thumb [data-tag-colour], .recipe-thumb[data-tag-colour]')).toBeNull()
  })
  it('keeps Ready Meal and Archived as neutral chips beside the Tags', () => {
    render(<RecipeTile recipe={summary({ tags: ['roast'], readyMeal: true, archived: true })} colourOf={colourOf} onOpen={() => {}} />)
    expect(screen.getByText('Ready Meal').closest('.chip')).not.toHaveAttribute('data-tag-colour')
    expect(screen.getByText('Archived').closest('.chip')).not.toHaveAttribute('data-tag-colour')
  })
})
