// BR-H: the Advance list shows the Base recipe chip of an Advance Step that comes from a Base recipe.
// Pinned: both tiles render a BaseRecipeChip next to the row's text for an item with `baseRecipe`, outside the text's own
// element (so "Chill the milk · 4 h ahead" stays one text), and none for an item without one.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BECHAMEL, FROLLA, baseAdvance, baseTimeline } from '../base-fixtures'
import { advanceSummary } from '../lib/advance'
import { advanceGroups } from '../lib/timeline'
import { AdvanceStepsTile } from './AdvanceStepsTile'
import { TimelineAdvanceTile } from './TimelineAdvanceTile'

const noop = () => {}

describe('TimelineAdvanceTile: Base recipe chips', () => {
  const groups = () => advanceGroups(baseTimeline({ advance: baseAdvance() }))

  it('pending rows of a Base recipe carry its chip; the text stays one piece', () => {
    render(<TimelineAdvanceTile groups={groups()} onMarkDone={noop} />)
    const text = screen.getByText('Chill the milk · 4 h ahead')
    const row = text.closest('li')!
    expect(within(row).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
    expect(text.querySelector('.chip')).toBeNull()
  })

  it('done rows carry it too', () => {
    render(<TimelineAdvanceTile groups={groups()} onMarkDone={noop} />)
    const row = screen.getByText('Done: Rest the dough').closest('li')!
    expect(within(row).getByRole('img', { name: 'Pasta frolla, Base recipe' })).toBeInTheDocument()
  })

  it('a row of the Recipe itself has no chip, and the Done button is still named by the row\'s own text', () => {
    render(<TimelineAdvanceTile groups={groups()} onMarkDone={noop} />)
    const row = screen.getByText('Buy fresh pasta · 1 h ahead').closest('li')!
    expect(row.querySelector('.chip')).toBeNull()
    expect(within(row).getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('Done still marks the Step of its own Course scope and composed index', async () => {
    const calls: [string, number][] = []
    render(<TimelineAdvanceTile groups={groups()} onMarkDone={(s, i) => calls.push([s, i])} />)
    const row = screen.getByText('Chill the milk · 4 h ahead').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Done' }))
    expect(calls).toEqual([['meal:2026-11-10/4/1', 4]])
  })
})

describe('AdvanceStepsTile: Base recipe chips', () => {
  const summary = () =>
    advanceSummary([
      { step: 4, text: 'Chill the milk', leadTimeMinutes: 240, done: false, doneAt: null, warning: true, baseRecipe: BECHAMEL },
      { step: 5, text: 'Rest the dough', leadTimeMinutes: 120, done: true, doneAt: '2026-11-10T08:00:00Z', warning: false, baseRecipe: FROLLA },
      { step: 6, text: 'Buy fresh pasta', leadTimeMinutes: 60, done: false, doneAt: null, warning: true, baseRecipe: null },
    ])

  it('shows the chip on pending and done rows, and none on the Recipe\'s own', () => {
    render(<AdvanceStepsTile summary={summary()} onMarkDone={noop} />)
    expect(within(screen.getByText('Chill the milk · 4 h ahead').closest('li')!).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
    expect(within(screen.getByText('Done: Rest the dough').closest('li')!).getByRole('img', { name: 'Pasta frolla, Base recipe' })).toBeInTheDocument()
    expect(screen.getByText('Buy fresh pasta · 1 h ahead').closest('li')!.querySelector('.chip')).toBeNull()
  })
})
