// CRS F (spec 11): in a timeline of several Courses the Step tile names its Course and Recipe and its planned clock time.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CookStep } from '../types'
import { StepTile } from './StepTile'

const step: CookStep = { index: 0, number: 2, of: 4, kind: 'passive', text: 'Simmer the beans', durationMinutes: 10, imageUrl: '', uses: [], timer: { label: 'x', durationSeconds: 600 } }
const noop = () => {}

describe('StepTile caption and clock', () => {
  it('shows "Side · Green beans" and the planned time "18:52"', () => {
    render(<StepTile step={step} onBack={noop} onNext={noop} caption="Side · Green beans" clock="18:52" />)
    const tile = screen.getByRole('article', { name: 'Step 2 of 4' })
    expect(tile).toHaveTextContent('Side · Green beans')
    expect(tile).toHaveTextContent('18:52')
  })

  it('shows neither without them: a one-Course tile is as before (regression guard)', () => {
    const before = render(<StepTile step={step} onBack={noop} onNext={noop} />)
    const old = before.container.innerHTML
    before.unmount()
    const after = render(<StepTile step={step} onBack={noop} onNext={noop} caption={null} clock={null} />)
    expect(after.container.innerHTML).toBe(old)
  })

  it('the caption and the clock are text, not the Step\'s accessible name (the article keeps "Step n of N")', () => {
    render(<StepTile step={step} onBack={noop} onNext={noop} caption="Side · Green beans" clock="18:52" />)
    expect(screen.getByRole('article')).toHaveAccessibleName('Step 2 of 4')
  })
})
