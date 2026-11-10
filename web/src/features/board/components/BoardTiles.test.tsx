import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../../cook/hooks/useTimers'
import type { NextAdvance, SlotLike, StockTotalLike } from '../types'
import { BoardLeftoversTile, BoardTimersTile, ClockTile, NextAdvanceTile, StartCookTile, StreakTile, TomorrowTile, TonightTile, UseSoonTile } from './BoardTiles'

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
  it('hints at adding coordinates when it falls back to 19:00-07:00', () => {
    render(<ClockTile now={new Date('2026-11-09T17:42:00Z')} timeZone="UTC" showFallbackHint />)
    expect(screen.getByText('Add coordinates in Settings so the board follows the sunset')).toBeInTheDocument()
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
    expect(chip.closest('[data-tone]')).toHaveAttribute('data-tone', 'spoil')
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

describe('StartCookTile', () => {
  it('is a big button that starts Cook Mode', async () => {
    const onStart = vi.fn()
    render(<StartCookTile onStart={onStart} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })
  it('is disabled when there is nothing to cook', () => {
    render(<StartCookTile />)
    expect(screen.getByRole('button', { name: 'Start Cook Mode' })).toBeDisabled()
  })
})
