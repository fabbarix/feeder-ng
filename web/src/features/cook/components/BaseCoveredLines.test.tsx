// BR-H: the lines that say a Base recipe's Steps are left out because the Pantry covers it.
// Pinned: <BaseCoveredLines lines={string[]} /> (the lines of lib/baseSteps coveredLines); nothing for an empty list; a list
// named "Left out of the Steps" with one item per line, so a screen reader hears why the Step numbers skip a Base recipe.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BaseCoveredLines } from './BaseCoveredLines'

describe('BaseCoveredLines', () => {
  it('shows one line per covered Base recipe', () => {
    render(<BaseCoveredLines lines={['Béchamel from the Pantry', 'Pasta frolla from the Pantry']} />)
    const list = screen.getByRole('list', { name: 'Left out of the Steps' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Béchamel from the Pantry', 'Pasta frolla from the Pantry'])
  })

  it('renders nothing when nothing is covered', () => {
    const { container } = render(<BaseCoveredLines lines={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is plain text a screen reader reads in place: not a Step, not a button, not hidden', () => {
    render(<BaseCoveredLines lines={['Béchamel from the Pantry']} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Béchamel from the Pantry')).toBeVisible()
    expect(screen.getByText('Béchamel from the Pantry').closest('[aria-hidden="true"]')).toBeNull()
  })
})
