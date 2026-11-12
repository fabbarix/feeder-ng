// CRS E2: Course chips on the Recipe tile.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { summary } from '../fixtures.test-helper'
import { RecipeTile } from './RecipeTile'

describe('RecipeTile Courses', () => {
  it('shows the Course names as chips in a list named Courses', () => {
    render(<RecipeTile recipe={summary()} courseNames={['Main', 'Side']} onOpen={() => {}} />)
    const list = screen.getByRole('list', { name: 'Courses' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Main', 'Side'])
  })
  it('adds the Whole meal chip when asked', () => {
    render(<RecipeTile recipe={summary()} courseNames={['Main']} wholeMeal onOpen={() => {}} />)
    expect(within(screen.getByRole('list', { name: 'Courses' })).getByText('Whole meal')).toBeInTheDocument()
  })
  it('keeps the tile one button (the chips are not interactive)', () => {
    render(<RecipeTile recipe={summary()} courseNames={['Main', 'Side']} wholeMeal onOpen={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
  it('shows no list without names (the tile before the Courses have loaded)', () => {
    render(<RecipeTile recipe={summary()} onOpen={() => {}} />)
    expect(screen.queryByRole('list', { name: 'Courses' })).toBeNull()
  })
})
