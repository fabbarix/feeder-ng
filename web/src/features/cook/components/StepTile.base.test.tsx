// BR-H: the Step tile of a Step that comes from a Base recipe, and the "ready" line on the Step that follows its block.
// Pinned: StepTile reads `step.baseRecipe` (a BaseRecipeChip in the tile) and takes `ready?: string[]` (Base recipe names;
// one "<name> ready" line each).
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BECHAMEL, ROUX } from '../base-fixtures'
import type { CookStep } from '../types'
import { StepTile } from './StepTile'

const own: CookStep = { index: 2, number: 3, of: 4, kind: 'active', text: 'Layer the lasagne', durationMinutes: 10, imageUrl: '', uses: [], timer: null, baseRecipe: null }
const noop = () => {}

describe('StepTile: Base recipe chip', () => {
  it('shows a chip naming the Base recipe inside the tile', () => {
    render(<StepTile step={{ ...own, index: 0, number: 1, text: 'Melt the butter', baseRecipe: BECHAMEL }} onBack={noop} onNext={noop} />)
    const tile = screen.getByRole('article', { name: 'Step 1 of 4' })
    expect(within(tile).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
  })

  it('names a nested Base recipe by its path', () => {
    render(<StepTile step={{ ...own, baseRecipe: ROUX }} onBack={noop} onNext={noop} />)
    expect(screen.getByRole('img', { name: 'Béchamel · Roux, Base recipe' })).toHaveTextContent('Béchamel · Roux')
  })

  it('has no chip for the Recipe\'s own Step, and none when the payload lacks the field', () => {
    const { baseRecipe: _omit, ...old } = own
    const a = render(<StepTile step={own} onBack={noop} onNext={noop} />)
    expect(a.container.querySelector('.chip')).toBeNull()
    a.unmount()
    const b = render(<StepTile step={old} onBack={noop} onNext={noop} />)
    expect(b.container.querySelector('.chip')).toBeNull()
  })

  it('keeps the tile\'s name "Step n of N", and the chip does not become part of it', () => {
    render(<StepTile step={{ ...own, baseRecipe: BECHAMEL }} onBack={noop} onNext={noop} />)
    expect(screen.getByRole('article')).toHaveAccessibleName('Step 3 of 4')
  })

  it('a tile without a Base recipe or a ready line is exactly as before (regression guard)', () => {
    const { baseRecipe: _omit, ...old } = own
    const before = render(<StepTile step={old} onBack={noop} onNext={noop} />)
    const html = before.container.innerHTML
    before.unmount()
    const after = render(<StepTile step={own} onBack={noop} onNext={noop} ready={[]} />)
    expect(after.container.innerHTML).toBe(html)
  })
})

describe('StepTile: "Béchamel ready"', () => {
  it('says the Base recipe is ready on the Step that follows its block', () => {
    render(<StepTile step={own} ready={['Béchamel']} onBack={noop} onNext={noop} />)
    expect(within(screen.getByRole('article', { name: 'Step 3 of 4' })).getByText('Béchamel ready')).toBeVisible()
  })

  it('says it once for each Base recipe', () => {
    render(<StepTile step={own} ready={['Béchamel', 'Pasta frolla']} onBack={noop} onNext={noop} />)
    expect(screen.getByText('Béchamel ready')).toBeInTheDocument()
    expect(screen.getByText('Pasta frolla ready')).toBeInTheDocument()
  })

  it('is plain text read in place with the Step, not a live region that interrupts and not hidden', () => {
    render(<StepTile step={own} ready={['Béchamel']} onBack={noop} onNext={noop} />)
    const line = screen.getByText('Béchamel ready')
    expect(line.closest('[aria-live], [role="status"], [role="alert"], [aria-hidden="true"]')).toBeNull()
  })

  it('shows nothing when no Base recipe is ready', () => {
    render(<StepTile step={own} onBack={noop} onNext={noop} />)
    expect(screen.queryByText(/ready$/)).not.toBeInTheDocument()
  })
})
