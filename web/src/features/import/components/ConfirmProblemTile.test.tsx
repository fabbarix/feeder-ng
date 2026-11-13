// BR-E: the refusals of Confirm shown at the top of the review, announced (design §10, §11.3). Round 2: copy and punctuation.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { baseLine } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
import { importStrings } from '../strings'
import { ConfirmProblemTile } from './ConfirmProblemTile'

describe('ConfirmProblemTile', () => {
  it('renders nothing without a problem', () => {
    const { container } = render(<ConfirmProblemTile problem={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names a cycle, in an alert', () => {
    render(<ConfirmProblemTile problem={{ kind: 'cycle', message: 'Béchamel calls for Roux, which calls for Béchamel', path: ['Béchamel', 'Roux', 'Béchamel'] }} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Base recipes call for each other')
    expect(alert).toHaveTextContent('Béchamel calls for Roux, which calls for Béchamel')
  })

  it('ends the cycle text with a period', () => {
    render(<ConfirmProblemTile problem={{ kind: 'cycle', message: 'Béchamel calls for Roux, which calls for Béchamel', path: ['Béchamel', 'Roux', 'Béchamel'] }} />)
    expect(screen.getByRole('alert').textContent).toMatch(/Béchamel calls for Roux, which calls for Béchamel\.$/)
  })

  it('does not double the period when the server\'s message has one', () => {
    render(<ConfirmProblemTile problem={{ kind: 'cycle', message: 'Roux cannot call for itself.', path: ['Roux', 'Roux'] }} />)
    expect(screen.getByRole('alert').textContent).toMatch(/Roux cannot call for itself\.$/)
  })

  it('says a Base recipe cannot be planned (base_recipe_kind)', () => {
    render(<ConfirmProblemTile problem={{ kind: 'validation', reason: 'base_recipe_kind', message: 'A Base recipe cannot be planned.' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('A Base recipe cannot be planned.')
  })

  it('says the answers are still missing with the existing copy, and does not add the server\'s English message', () => {
    render(<ConfirmProblemTile problem={{ kind: 'notReady', message: 'Finish the Import Review before confirming', plan: plan({ baseRecipeLines: [baseLine()] }) }} />)
    const alert = screen.getByRole('alert')
    expect(importStrings.notReady).toBe('Some answers are still missing.')
    expect(alert.textContent).toBe('Some answers are still missing.')
    expect(alert).not.toHaveTextContent('Finish the Import Review')
  })

  it('has no copy of its own for "not ready"', () => {
    expect((importStrings.baseRecipes as Record<string, unknown>).notReady).toBeUndefined()
  })

  it('shows nothing for a take-over ask: the ask is answered on its tile, never as "answer its question first"', () => {
    const { container } = render(
      <ConfirmProblemTile problem={{ kind: 'takeOver', ask: { ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true } }} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/Answer its question first/)).toBeNull()
  })
})
