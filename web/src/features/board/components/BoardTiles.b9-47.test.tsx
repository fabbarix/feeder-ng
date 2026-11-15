// B9-47 (TB-04, TB-07, TB-08, A11Y-12): the board's other tiles at wall scale, in Today's words. Every tile is a section named by its
// heading. Next Advance Step is always an info status tile (decision DS 3), its Done a secondary `lg` button named "Done: <Step text>"
// in a foot row with the due state or the Overdue chip. Tomorrow is one line per Meal Slot, the Meal Slot in bold, the full text in title.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TimerItem } from '../../cook/hooks/useTimers'
import { course, meal, slotOn } from '../test-utils'
import type { NextAdvance, StockTotalLike } from '../types'
import { BoardLeftoversTile, BoardTimersTile, ClockTile, NextAdvanceTile, StreakTile, TomorrowTile, UseSoonTile } from './BoardTiles'

const next: NextAdvance = {
  scope: 'meal:2026-11-09/2', recipeName: 'Cauliflower al gorgonzola with chestnut mushrooms', step: 0, text: 'Soak the chestnut mushrooms and make the gorgonzola cream',
  leadTimeMinutes: 240, dueAt: '2026-11-09T21:00:00Z', overdue: false, mealDate: '2026-11-10', mealSlotId: 2, slotName: 'Dinner',
}
const NOW = Date.parse('2026-11-09T18:00:00Z')

describe('every tile is a section named by its heading', () => {
  it.each([
    ['Next Advance Step', <NextAdvanceTile key="n" next={next} nowMs={NOW} onDone={() => {}} />],
    ['Leftovers', <BoardLeftoversTile key="l" today="2026-11-09" rows={[]} />],
    ['Use soon', <UseSoonTile key="u" today="2026-11-09" rows={[]} />],
    ['Timers', <BoardTimersTile key="t" items={[]} />],
    ['Tomorrow', <TomorrowTile key="m" slots={[]} />],
    ['Zero-waste streak', <StreakTile key="s" days={0} />],
  ])('%s', (name, tile) => {
    render(tile)
    expect(screen.getByRole('region', { name })).toBeInTheDocument()
  })
})

describe('Next Advance Step is an info status tile in every state (DS 3, TB-07)', () => {
  it('upcoming: tone info', () => {
    render(<NextAdvanceTile next={next} nowMs={NOW} onDone={() => {}} />)
    const tile = screen.getByRole('region', { name: 'Next Advance Step' })
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'info')
  })
  it('overdue: still info (not spoil), told by an info "Overdue" chip', () => {
    render(<NextAdvanceTile next={{ ...next, overdue: true, dueAt: '2026-11-09T15:00:00Z' }} nowMs={NOW} onDone={() => {}} />)
    const tile = screen.getByRole('region', { name: 'Next Advance Step' })
    expect(tile).toHaveAttribute('data-status', 'info')
    expect(tile.querySelector('[data-status="spoil"]')).toBeNull()
    const chip = within(tile).getByText('Overdue').closest('.chip')!
    expect(chip).toHaveAttribute('data-kind', 'status')
    expect(chip).toHaveAttribute('data-status', 'info')
  })
  it('with nothing to prepare it is a plain tile with the sentence (no Done)', () => {
    render(<NextAdvanceTile next={null} nowMs={NOW} onDone={() => {}} />)
    expect(screen.getByText('Nothing to prepare ahead')).toBeInTheDocument()
  })
})

describe('Next Advance Step: the Step, its Recipe line, and a foot row (TB-07)', () => {
  it('shows "Mon Dinner · <Recipe>" under the Step text: the Meal Slot\'s weekday first', () => {
    render(<NextAdvanceTile next={next} nowMs={NOW} onDone={() => {}} />)
    expect(screen.getByText('Soak the chestnut mushrooms and make the gorgonzola cream')).toBeInTheDocument()
    expect(screen.getByText('Tue Dinner · Cauliflower al gorgonzola with chestnut mushrooms')).toBeInTheDocument()
  })
  it('the foot row holds the due state and Done together', () => {
    const { container } = render(<NextAdvanceTile next={next} nowMs={NOW} onDone={() => {}} />)
    const foot = container.querySelector('.board-next__foot')!
    expect(foot).not.toBeNull()
    expect(within(foot as HTMLElement).getByText('Start in 3 h')).toBeInTheDocument()
    expect(within(foot as HTMLElement).getByRole('button', { name: /^Done/ })).toBeInTheDocument()
  })
  it('Done is a secondary `lg` button (not sm), named "Done: <Step text>"', () => {
    render(<NextAdvanceTile next={next} nowMs={NOW} onDone={() => {}} />)
    const done = screen.getByRole('button', { name: 'Done: Soak the chestnut mushrooms and make the gorgonzola cream' })
    expect(done).toHaveAttribute('data-variant', 'secondary')
    expect(done).toHaveAttribute('data-size', 'lg')
    expect(done).toHaveTextContent('Done')
  })
})

describe('Tomorrow: one line per Meal Slot, the Meal Slot in bold (TB-07, TB-08)', () => {
  const long = 'Cauliflower al gorgonzola with chestnut mushrooms'
  const side = 'Roasted two-colour cauliflower with sweet peppers, capers and marjoram'
  const dinner = slotOn('2026-11-10', 3, 'Dinner', '19:00', [course(1, 'Main', true, { meal: meal(long) }), course(2, 'Side', false, { meal: meal(side) })])
  const breakfast = slotOn('2026-11-10', 1, 'Breakfast', '08:30', 'Potato gratin')
  it('"Breakfast:" is a <strong>, then the Recipe', () => {
    const { container } = render(<TomorrowTile slots={[breakfast]} />)
    const li = container.querySelector('li')!
    expect(li.querySelector('strong')?.textContent).toBe('Breakfast:')
    expect(li.textContent).toBe('Breakfast: Potato gratin')
  })
  it('a long line carries its full text in `title` (the line itself ends in an ellipsis in CSS)', () => {
    const { container } = render(<TomorrowTile slots={[dinner]} />)
    expect(container.querySelector('li')).toHaveAttribute('title', `Dinner: ${long} + ${side}`)
  })
  it('every line is one structured item: a <li> in the board list, never a sentence in a paragraph', () => {
    const { container } = render(<TomorrowTile slots={[breakfast, dinner]} />)
    expect(container.querySelectorAll('ul.board-list.board-list--lines > li')).toHaveLength(2)
  })
})

describe('Leftovers: the name over "1.25 portions · Use by Tue" (TB-07, TB-08)', () => {
  it('a title and a meta element, with Today\'s meta', () => {
    const { container } = render(<BoardLeftoversTile today="2026-11-09" rows={[{ id: 1, recipeName: 'Slow cooker beef and barley stew', portions: 1.25, useBy: '2026-11-10' }]} />)
    expect(container.querySelector('.board-list__title')?.textContent).toBe('Slow cooker beef and barley stew')
    expect(container.querySelector('.board-list__meta')?.textContent).toBe('1.25 portions · Use by tomorrow')
  })
})

describe('Use soon: "Flour · tomorrow" chips with a full accessible name (TB-08)', () => {
  const row = (name: string, nextGoesOff: string): StockTotalLike => ({ ingredientId: name.length, name, baseUnit: 'g', total: 500, nextGoesOff, useSoon: true, spoiledCount: 0 })
  it('the chip says when, and its accessible name is "Flour, good until tomorrow"', () => {
    render(<UseSoonTile today="2026-11-09" rows={[row('Flour', '2026-11-10'), row('Baby spinach', '2026-11-17')]} />)
    const chip = screen.getByText('Flour · tomorrow').closest('.chip')!
    expect(chip).toHaveAttribute('data-status', 'spoil')
    expect(screen.getByLabelText('Flour, good until tomorrow')).toBe(chip)
    expect(screen.getByLabelText('Baby spinach, good until Tue')).toBeInTheDocument()
  })
})

describe('the Zero-waste streak on the board keeps "0 days" (decision TB 3)', () => {
  it.each([[0, '0 days'], [1, '1 day'], [12, '12 days']])('%i → %s', (days, text) => {
    render(<StreakTile days={days} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})

describe('ClockTile: the date at the top beside the Close control, the time below (TB-04)', () => {
  it('puts the date and the control in a top row before the time', () => {
    const { container } = render(<ClockTile now={new Date('2026-11-09T17:42:00Z')} timeZone="UTC" close={<a className="board-close" href="/" aria-label="Close kitchen board">x</a>} />)
    const top = container.querySelector('.board-clock__top')!
    expect(top).not.toBeNull()
    expect([...top.children].map((c) => c.className)).toEqual(['board-clock__date', 'board-close'])
    expect(top.nextElementSibling).toHaveClass('board-clock__time')
  })
  it('without a control it still renders the date and the time', () => {
    render(<ClockTile now={new Date('2026-11-09T17:42:00Z')} timeZone="UTC" />)
    expect(screen.getByText('17:42')).toBeInTheDocument()
    expect(screen.getByText('Monday 9 November')).toBeInTheDocument()
  })
})

describe('Timers: the board is read-only, so it has no control but its own', () => {
  it('has no buttons or links', () => {
    const item: TimerItem = { seconds: 95, timer: { id: 1, scope: null, step: null, label: 'Eggs', durationSeconds: 600, state: 'running', remainingSeconds: 95, endsAt: null, startedAt: '2026-11-09T18:00:00Z' } }
    render(<BoardTimersTile items={[item]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
