// BR-E: the refusals of Confirm shown at the top of the review, announced (design §10, §11.3). RED until the component exists.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { baseLine } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
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

  it('says a Base recipe cannot be planned (base_recipe_kind)', () => {
    render(<ConfirmProblemTile problem={{ kind: 'validation', reason: 'base_recipe_kind', message: 'A Base recipe cannot be planned.' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('A Base recipe cannot be planned.')
  })

  it('says some questions still need an answer (import_not_ready)', () => {
    render(<ConfirmProblemTile problem={{ kind: 'notReady', message: 'Finish the Import Review before confirming', plan: plan({ baseRecipeLines: [baseLine()] }) }} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Some questions still need an answer')
    expect(alert).toHaveTextContent('Finish the Import Review before confirming')
  })
})
