// B9-40 (PC-03, from 1024 px): the rail of timer tiles beside the Step: a 2-line label, a place line, the time, a 44 px circular Pause and ⋮.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../hooks/useTimers'
import type { CookTimer } from '../types'
import { CookTimerRail, type CookTimerRailProps } from './CookTimerRail'

const HERE = 'recipe:12'
function item(id: number, state: CookTimer['state'], seconds: number, label: string, scope: string | null = HERE, over: Partial<CookTimer> = {}): TimerItem {
  return { seconds, timer: { id, scope, step: id - 1, label, durationSeconds: 600, state, remainingSeconds: seconds, endsAt: null, startedAt: '', ...over } }
}
function rail(items: TimerItem[], extra: Partial<CookTimerRailProps> = {}) {
  const h = { onPause: vi.fn(), onResume: vi.fn(), onOpenTimer: vi.fn() }
  const view = render(<CookTimerRail scope={HERE} items={items} {...h} {...extra} />)
  return { ...h, ...view }
}

describe('CookTimerRail (PC-03)', () => {
  it('is an aside "Timers" with a visible "Timers" heading and a md tile per timer', () => {
    const { container } = rail([item(1, 'running', 163, 'Step 1: Pre-heat the oven to 220 °C'), item(2, 'running', 680, 'Step 4: Simmer the rice')])
    const aside = screen.getByRole('complementary', { name: 'Timers' })
    expect(within(aside).getByRole('heading', { name: 'Timers' })).toBeInTheDocument()
    expect(container.querySelectorAll('.timer-tile[data-size="md"]')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Timers' })).getAllByRole('timer')).toHaveLength(2)
    expect(screen.getByRole('timer', { name: 'Pre-heat the oven to 220 °C' })).toHaveTextContent('2:43')
  })

  it('the place line says which Step, and that Next waits for the one that holds it', () => {
    rail([item(1, 'running', 163, 'Step 1: Pre-heat the oven'), item(4, 'running', 680, 'Step 4: Simmer the rice')], { holdingIds: [1] })
    expect(within(screen.getByRole('timer', { name: 'Pre-heat the oven' })).getByText('Step 1 · next waits for it')).toBeInTheDocument()
    expect(within(screen.getByRole('timer', { name: 'Simmer the rice' })).getByText('Step 4')).toBeInTheDocument()
  })

  it('another Recipe\'s timer names its Recipe in the place line', () => {
    rail([item(1, 'running', 20000, 'Step 2: Slow cook', 'recipe:99', { recipeName: 'Beef stew' })])
    expect(within(screen.getByRole('timer', { name: 'Slow cook' })).getByText('Beef stew · Step 2')).toBeInTheDocument()
  })

  it('each tile has Pause or Resume and "Options for <label>" (44 px circular outline buttons), and no Cancel or Dismiss', async () => {
    const h = rail([item(1, 'running', 60, 'Eggs'), item(2, 'paused', 30, 'Rice')])
    const eggs = within(screen.getByRole('timer', { name: 'Eggs' }))
    const rice = within(screen.getByRole('timer', { name: 'Rice' }))
    await userEvent.click(eggs.getByRole('button', { name: 'Pause Eggs' }))
    await userEvent.click(rice.getByRole('button', { name: 'Resume Rice' }))
    await userEvent.click(rice.getByRole('button', { name: 'Options for Rice' }))
    expect(h.onPause).toHaveBeenCalledWith(1)
    expect(h.onResume).toHaveBeenCalledWith(2)
    expect(h.onOpenTimer).toHaveBeenCalledWith(2)
    expect(eggs.getByRole('button', { name: 'Pause Eggs' })).toHaveAttribute('data-shape', 'circle')
    expect(screen.queryByRole('button', { name: /^(Cancel|Dismiss) / })).not.toBeInTheDocument()
  })

  it('the timers that hold Next come first', () => {
    rail([item(1, 'running', 60, 'First'), item(2, 'running', 90, 'Holds')], { holdingIds: [2] })
    expect(screen.getAllByRole('timer').map((t) => t.getAttribute('aria-label'))).toEqual(['Holds', 'First'])
  })

  it('No timers and nothing beneath them: no rail block at all (PC-03 states)', () => {
    const { container } = rail([])
    expect(container).toBeEmptyDOMElement()
  })

  it('children (Get ready) sit below the timers in the same aside, which is then named "Timers and Ingredients"', () => {
    rail([item(1, 'running', 60, 'Eggs')], { children: <section aria-label="Get ready">ready</section> })
    const aside = screen.getByRole('complementary', { name: 'Timers and Ingredients' })
    expect(within(aside).getByRole('region', { name: 'Get ready' })).toBeInTheDocument()
    const timer = within(aside).getByRole('timer', { name: 'Eggs' })
    const ready = within(aside).getByRole('region', { name: 'Get ready' })
    expect(timer.compareDocumentPosition(ready) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('with no timers but children the aside shows the children only', () => {
    rail([], { children: <section aria-label="Get ready">ready</section> })
    const aside = screen.getByRole('complementary')
    expect(within(aside).queryByRole('heading', { name: 'Timers' })).not.toBeInTheDocument()
    expect(within(aside).getByRole('region', { name: 'Get ready' })).toBeInTheDocument()
  })
})
