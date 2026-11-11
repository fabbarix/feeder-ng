import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../../cook/hooks/useTimers'
import type { NextAdvance, SlotLike, StockTotalLike } from '../types'
import { BoardLeftoversTile, BoardTimersTile, ClockTile, NextAdvanceTile, StreakTile, TomorrowTile, TonightTile, UseSoonTile } from './BoardTiles'

const slot = (id: number, name: string, recipe: string, time: string): SlotLike => ({
  date: '2026-11-09',
  mealSlotId: id,
  name,
  time,
  at: `2026-11-09T${time}:00Z`,
  meal: { recipeId: id, recipeName: recipe, batches: 1, portions: 4, state: 'planned' },
})

describe('ClockTile', () => {
  it('shows the time and date in the household zone', () => {
    render(<ClockTile now={new Date('2026-11-09T17:42:00Z')} timeZone="Europe/Rome" showFallbackHint={false} />)
    expect(screen.getByText('18:42')).toBeInTheDocument()
    expect(screen.getByText('Monday 9 November')).toBeInTheDocument()
    expect(screen.queryByText(/coordinates/i)).not.toBeInTheDocument()
  })
  it('never shows the coordinates hint on the wall display (it lives in Settings)', () => {
    render(<ClockTile now={new Date('2026-11-09T17:42:00Z')} timeZone="UTC" showFallbackHint />)
    expect(screen.queryByText(/coordinates/i)).not.toBeInTheDocument()
  })
})

describe('TonightTile', () => {
  it("shows tonight's Recipe and Meal Slot", () => {
    render(<TonightTile slot={slot(2, 'Dinner', 'Chicken stew', '19:00')} />)
    expect(screen.getByText('Tonight')).toBeInTheDocument()
    expect(screen.getByText('Chicken stew')).toBeInTheDocument()
    expect(screen.getByText('Dinner · 19:00')).toBeInTheDocument()
  })
  it('says when nothing is planned', () => {
    render(<TonightTile slot={null} />)
    expect(screen.getByText('Nothing planned tonight')).toBeInTheDocument()
  })
})

describe('NextAdvanceTile', () => {
  const next: NextAdvance = { scope: 'meal:2026-11-09/2', recipeName: 'Chicken stew', step: 0, text: 'Marinate the chicken', leadTimeMinutes: 240, dueAt: '2026-11-09T21:00:00Z', overdue: false, mealDate: '2026-11-09', mealSlotId: 2, slotName: 'Dinner' }
  const NOW = Date.parse('2026-11-09T18:00:00Z')

  it('shows the Step, its Recipe and how soon to start', () => {
    render(<NextAdvanceTile next={next} nowMs={NOW} onDone={() => {}} />)
    expect(screen.getByText('Next Advance Step')).toBeInTheDocument()
    expect(screen.getByText('Marinate the chicken')).toBeInTheDocument()
    expect(screen.getByText(/Chicken stew/)).toBeInTheDocument()
    expect(screen.getByText('Start in 3 h')).toBeInTheDocument()
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })
  it('R11b N7: a Step more than 24 h away says the day and time in the household zone', () => {
    render(<NextAdvanceTile next={{ ...next, dueAt: '2026-11-13T10:30:00Z' }} nowMs={NOW} timeZone="Europe/Rome" onDone={() => {}} />)
    expect(screen.getByText('Start Fri 11:30')).toBeInTheDocument()
    expect(screen.queryByText(/\d+ h$/)).not.toBeInTheDocument()
  })
  it('flags an overdue Step', () => {
    render(<NextAdvanceTile next={{ ...next, overdue: true, dueAt: '2026-11-09T15:00:00Z' }} nowMs={NOW} onDone={() => {}} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })
  it('marks it done by scope and Step', async () => {
    const onDone = vi.fn()
    render(<NextAdvanceTile next={next} nowMs={NOW} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledWith('meal:2026-11-09/2', 0)
  })
  it('says there is nothing to prepare', () => {
    render(<NextAdvanceTile next={null} nowMs={NOW} onDone={() => {}} />)
    expect(screen.getByText('Nothing to prepare ahead')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('BoardLeftoversTile', () => {
  it('lists Leftovers with portions and Use-by', () => {
    render(<BoardLeftoversTile rows={[{ id: 1, recipeName: 'Stew', portions: 2, useBy: '2026-11-12' }]} />)
    expect(screen.getByText('Leftovers')).toBeInTheDocument()
    expect(screen.getByText(/Stew/)).toHaveTextContent('2 portions')
    expect(screen.getByText(/Stew/)).toHaveTextContent('use by Thu')
  })
  it('says when there are none', () => {
    render(<BoardLeftoversTile rows={[]} />)
    expect(screen.getByText('No Leftovers')).toBeInTheDocument()
  })
})

describe('UseSoonTile', () => {
  const row: StockTotalLike = { ingredientId: 1, name: 'milk', baseUnit: 'ml', total: 500, nextGoesOff: '2026-11-11', useSoon: true, spoiledCount: 0 }
  it('shows a spoil-tone chip per Ingredient', () => {
    render(<UseSoonTile rows={[row]} />)
    const chip = screen.getByText('milk')
    expect(chip.closest('[data-status]')).toHaveAttribute('data-status', 'spoil')
  })
  it('says when nothing needs using up', () => {
    render(<UseSoonTile rows={[]} />)
    expect(screen.getByText('Nothing to use up')).toBeInTheDocument()
  })
})

describe('BoardTimersTile', () => {
  const item = (id: number, label: string, seconds: number, state: TimerItem['timer']['state']): TimerItem => ({
    seconds,
    timer: { id, scope: null, step: null, label, durationSeconds: 600, state, remainingSeconds: seconds, endsAt: null, startedAt: '2026-11-09T18:00:00Z' },
  })
  it('shows every timer with its time left', () => {
    render(<BoardTimersTile items={[item(1, 'Eggs', 95, 'running'), item(2, 'Rice', 30, 'paused')]} />)
    expect(within(screen.getByRole('timer', { name: 'Eggs' })).getByText('1:35')).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Rice' })).toHaveAttribute('data-state', 'paused')
  })
  it('lists at most 2 timers and says "+n more" for the rest (they never clip inside the cell)', () => {
    render(<BoardTimersTile items={[item(1, 'Eggs', 95, 'running'), item(2, 'Rice', 30, 'running'), item(3, 'Pasta', 20, 'running'), item(4, 'Tea', 10, 'running')]} />)
    expect(screen.getAllByRole('timer')).toHaveLength(2)
    expect(screen.getByRole('timer', { name: 'Eggs' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Rice' })).toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })
  it('shows no "+n more" when 2 or fewer timers run', () => {
    render(<BoardTimersTile items={[item(1, 'Eggs', 95, 'running'), item(2, 'Rice', 30, 'running')]} />)
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })
  it('says when none are running', () => {
    render(<BoardTimersTile items={[]} />)
    expect(screen.getByText('No timers running')).toBeInTheDocument()
  })
})

describe('TomorrowTile', () => {
  it("lists tomorrow's meals", () => {
    render(<TomorrowTile slots={[slot(1, 'Lunch', 'Soup', '12:00'), slot(2, 'Dinner', 'Pasta', '19:00')]} />)
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Lunch · Soup')).toBeInTheDocument()
    expect(screen.getByText('Dinner · Pasta')).toBeInTheDocument()
  })
  it('says when nothing is planned', () => {
    render(<TomorrowTile slots={[]} />)
    expect(screen.getByText('Nothing planned tomorrow')).toBeInTheDocument()
  })
})

describe('StreakTile', () => {
  it('counts days', () => {
    render(<StreakTile days={12} />)
    expect(screen.getByText('Zero-waste streak')).toBeInTheDocument()
    expect(screen.getByText('12 days')).toBeInTheDocument()
  })
  it('uses the singular', () => {
    render(<StreakTile days={1} />)
    expect(screen.getByText('1 day')).toBeInTheDocument()
  })
})

describe('TonightTile hero Cook button (5.13)', () => {
  it('has a big "Cook" button that starts Cook Mode, replacing the separate Start Cook Mode tile', async () => {
    const onCook = vi.fn()
    render(<TonightTile slot={slot(2, 'Dinner', 'Chicken stew', '19:00')} onCook={onCook} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
    expect(onCook).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Start Cook Mode')).not.toBeInTheDocument()
  })
  it('has no Cook button when nothing is planned or no handler is given', () => {
    const { rerender } = render(<TonightTile slot={null} onCook={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
    rerender(<TonightTile slot={slot(2, 'Dinner', 'Chicken stew', '19:00')} />)
    expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
  })
  it('is the hero tile, 2 x 2', () => {
    const { container } = render(<TonightTile slot={slot(2, 'Dinner', 'Chicken stew', '19:00')} />)
    const tile = container.firstElementChild
    expect(tile).toHaveAttribute('data-variant', 'hero')
    expect(tile).toHaveAttribute('data-span', '2')
    expect(tile).toHaveAttribute('data-row-span', '2')
  })
})

describe('UseSoonTile layout', () => {
  it('spans two columns and uses spoil status chips (not the deprecated tone)', () => {
    const { container } = render(<UseSoonTile rows={[{ ingredientId: 1, name: 'milk', baseUnit: 'ml', total: 500, nextGoesOff: '2026-11-11', useSoon: true, spoiledCount: 0 }]} />)
    expect(container.firstElementChild).toHaveAttribute('data-span', '2')
    expect(container.querySelector('[data-tone]')).toBeNull()
    expect(container.querySelector('[data-status="spoil"]')).not.toBeNull()
  })
})

// Layout contract at 1280 x 800 (cells are 240 px high): long text clamps instead of clipping.
// @types/node is not installed, so read the stylesheet through an untyped dynamic import of node:fs (as tokens.css.test does).
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const boardCss = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8')
const rule = (selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|[},\\s])${esc}\\s*\\{([^}]*)\\}`, 'm').exec(boardCss)
  expect(m, `${selector} rule`).not.toBeNull()
  return m![1]!
}
describe('board text truncation contract', () => {
  it.each([['.board-next__text', 2], ['.board-next__recipe', 1]])('%s clamps to %i line(s) with an ellipsis and may shrink', (sel, lines) => {
    const body = rule(sel)
    expect(body).toMatch(new RegExp(`-webkit-line-clamp:\\s*${lines}\\b`))
    expect(body).toMatch(/display:\s*-webkit-box/)
    expect(body).toMatch(/-webkit-box-orient:\s*vertical/)
    expect(body).toMatch(/overflow:\s*hidden/)
  })
  it('the Next Advance Step text is at most 2rem so 2 lines + recipe + Done fit 240 px', () => {
    expect(rule('.board-next__text')).toMatch(/font-size:\s*(1\.\d+|2)rem/)
  })
  it('the hero Cook button keeps the board size: its rule outranks .button[data-size=\'xl\'] (0,2,0)', () => {
    const body = rule('.board-screen .board-tonight .board-tonight__cook')
    expect(body).toMatch(/font-size:\s*1\.75rem/)
    expect(rule('.board-tonight__recipe')).toMatch(/font-size:\s*3\.25rem/)
    expect(rule('.board-tonight__recipe')).toMatch(/font-weight:\s*800/)
  })
  it('headings and meta lines are at full strength and board scale (no 0.8 opacity)', () => {
    expect(rule('.board-tile__heading')).not.toMatch(/opacity/)
    expect(rule('.board-tile__heading')).toMatch(/font-size:\s*1\.3125rem/)
    expect(rule('.board-screen .board-use-soon .chip')).toMatch(/block-size:\s*40px/)
  })
  it('R13: the "Not planned" chip in Tomorrow is board scale (40 px, like Use soon), one line', () => {
    const body = rule('.board-screen .board-tomorrow .chip')
    expect(body).toMatch(/block-size:\s*40px/)
    expect(body).toMatch(/font-size:\s*1\.25rem/)
    expect(body).toMatch(/white-space:\s*nowrap/)
  })
  it('timer rows in the Timers tile are compact and clamp their label to 1 line', () => {
    expect(rule('.board-timers .board-list')).toMatch(/gap:\s*(4|8)px/)
    expect(rule('.board-timers .timer-tile__label')).toMatch(/-webkit-line-clamp:\s*1|text-overflow:\s*ellipsis/)
    expect(rule('.board-timers__more')).toMatch(/font-size:\s*1\.\d+rem/)
  })
})
