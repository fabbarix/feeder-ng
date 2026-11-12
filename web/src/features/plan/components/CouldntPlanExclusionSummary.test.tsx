// CRS G2 (rx-pt.md section 4.2): the first Tile of the Review Exclusions page.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CouldntPlanExclusionSummary } from './CouldntPlanExclusionSummary'

const HEADLINE = "Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it."
const setup = () =>
  render(
    <MemoryRouter>
      <CouldntPlanExclusionSummary headline={HEADLINE} />
    </MemoryRouter>,
  )

describe('CouldntPlanExclusionSummary', () => {
  it('repeats the Excluded headline, in a section named by it', () => {
    setup()
    expect(screen.getByRole('region', { name: HEADLINE })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: HEADLINE })).toBeInTheDocument()
  })

  it('says what to do: change an Exclusion below, or choose a Recipe by hand on the Plan', () => {
    setup()
    expect(screen.getByText('Change an Exclusion below, or choose a Recipe by hand on the Plan.')).toBeInTheDocument()
  })

  it('has an Open the Plan link to /plan, a real link (keyboard: Tab, Enter)', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Open the Plan' })).toHaveAttribute('href', '/plan')
  })

  it('is warn (amber), not danger, with the Exclusion icon', () => {
    const { container } = setup()
    const tile = container.querySelector('section')!
    expect(tile).toHaveAttribute('data-status', 'spoil')
    expect(tile.querySelector('.tile__overline svg')).not.toBeNull()
  })
})
