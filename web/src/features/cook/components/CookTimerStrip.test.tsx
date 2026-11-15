// B9-40 (PC-03, SHORT-01): the timers of Cook Mode as a strip of ui/TimerPill. Pause or Resume is the pill's one control; a tap opens the timer's
// sheet (Add 1 minute, Cancel timer: components/CookTimerSheet). Rewritten from the TimerTile-and-Cancel-button tests of beta.8.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../hooks/useTimers'
import type { CookTimer } from '../types'
import { CookTimerStrip, type CookTimerStripProps } from './CookTimerStrip'

const HERE = 'recipe:12'

function item(id: number, state: CookTimer['state'], seconds: number, label = `Timer ${id}`, scope: string | null = HERE): TimerItem {
  return { seconds, timer: { id, scope, step: id, label, durationSeconds: 600, state, remainingSeconds: seconds, endsAt: null, startedAt: '2026-11-09T18:00:00Z' } }
}

function strip(items: TimerItem[], extra: Partial<CookTimerStripProps> = {}) {
  const handlers = { onPause: vi.fn(), onResume: vi.fn(), onOpenTimer: vi.fn(), onShowAll: vi.fn() }
  const view = render(<CookTimerStrip scope={HERE} items={items} {...handlers} {...extra} />)
  return { ...handlers, ...view }
}

describe('CookTimerStrip (PC-03)', () => {
  it('shows every timer as a pill, a timer named by its sentence-case label without "Step n:", with its time left', () => {
    strip([item(1, 'running', 125, 'Step 1: pre-heat the oven'), item(2, 'paused', 30, 'Rice')])
    expect(screen.getByRole('timer', { name: 'Pre-heat the oven' })).toHaveTextContent('2:05')
    expect(screen.getByRole('timer', { name: 'Pre-heat the oven' })).toHaveAttribute('data-state', 'running')
    expect(screen.getByRole('timer', { name: 'Rice' })).toHaveAttribute('data-state', 'paused')
  })

  it('is one region named "Timers" with no heading of its own (a strip, not a list of tiles)', () => {
    strip([item(1, 'running', 60, 'Eggs')])
    const region = screen.getByRole('region', { name: 'Timers' })
    expect(within(region).getByRole('timer', { name: 'Eggs' })).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders nothing without timers (no strip, no empty heading)', () => {
    const { container } = strip([])
    expect(container).toBeEmptyDOMElement()
  })

  it('a running pill has Pause and a paused one Resume, named after the timer; a finished one has neither', async () => {
    const h = strip([item(1, 'running', 60, 'Eggs'), item(2, 'paused', 30, 'Rice'), item(3, 'finished', 0, 'Pasta')])
    const eggs = within(screen.getByRole('timer', { name: 'Eggs' }))
    const rice = within(screen.getByRole('timer', { name: 'Rice' }))
    const pasta = within(screen.getByRole('timer', { name: 'Pasta' }))
    await userEvent.click(eggs.getByRole('button', { name: 'Pause Eggs' }))
    expect(h.onPause).toHaveBeenCalledWith(1)
    await userEvent.click(rice.getByRole('button', { name: 'Resume Rice' }))
    expect(h.onResume).toHaveBeenCalledWith(2)
    expect(pasta.queryByRole('button', { name: /^(Pause|Resume) / })).not.toBeInTheDocument()
  })

  it('a pill has no Cancel and no Dismiss control: stopping a timer is in its sheet', () => {
    strip([item(1, 'running', 60, 'Eggs'), item(2, 'paused', 30, 'Rice'), item(3, 'finished', 0, 'Pasta')])
    expect(screen.queryByRole('button', { name: /^(Cancel|Dismiss) / })).not.toBeInTheDocument()
  })

  it('a tap on a pill opens that timer: the strip reports its id', async () => {
    const h = strip([item(1, 'running', 60, 'Eggs'), item(2, 'running', 90, 'Rice')])
    await userEvent.click(within(screen.getByRole('timer', { name: 'Rice' })).getByRole('button', { name: /^Timer: Rice/ }))
    expect(h.onOpenTimer).toHaveBeenCalledWith(2)
  })

  it('Pause is a 40 px circular icon button inside the pill (its 44 px target comes from the pill\'s CSS)', () => {
    strip([item(1, 'running', 60, 'Eggs')])
    const pause = screen.getByRole('button', { name: 'Pause Eggs' })
    expect(pause).toHaveClass('icon-button')
    expect(pause).toHaveAttribute('data-shape', 'circle')
  })

  it('a finished pill is the finished state, whose time reads "finished" (no extra status line)', () => {
    strip([item(3, 'finished', 0, 'Pasta')])
    expect(screen.getByRole('timer', { name: 'Pasta' })).toHaveAttribute('data-state', 'finished')
    expect(screen.getByRole('timer', { name: 'Pasta' })).toHaveTextContent(/finished/i)
    expect(screen.queryByText('Pasta is ready')).not.toBeInTheDocument()
  })
})

describe('Scenario: The timer that holds Next is visible with the Step (the strip puts it first and marks it)', () => {
  it('the timers that hold Next come first, then this scope\'s, then the others', () => {
    strip(
      [item(1, 'running', 60, 'Other', 'meal:2026-11-10/3/1'), item(2, 'running', 90, 'Here', HERE), item(3, 'running', 120, 'Holds', HERE)],
      { holdingIds: [3] },
    )
    expect(screen.getAllByRole('timer').map((t) => t.getAttribute('aria-label'))).toEqual(['Holds', 'Here', 'Other'])
  })
  it('the holding pill carries the gate mark (the accent boundary), and only it', () => {
    strip([item(2, 'running', 90, 'Here'), item(3, 'running', 120, 'Holds')], { holdingIds: [3] })
    expect(screen.getByRole('timer', { name: 'Holds' })).toHaveAttribute('data-gate')
    expect(screen.getByRole('timer', { name: 'Here' })).not.toHaveAttribute('data-gate')
  })
  it('with the timeline\'s `belongs`, every timer of the slot\'s Courses counts as here', () => {
    strip([item(1, 'running', 60, 'Side', 'meal:2026-11-10/4/2'), item(2, 'running', 90, 'Elsewhere', 'recipe:99')], { scope: 'meal:2026-11-10/4/1', belongs: (s) => s !== null && s.startsWith('meal:2026-11-10/4') })
    expect(screen.getAllByRole('timer').map((t) => t.getAttribute('aria-label'))).toEqual(['Side', 'Elsewhere'])
  })
})

describe('Scenario: With three timers running in phone landscape, the strip shows whole pills and a "+1" that opens all timers', () => {
  const three = () => [item(1, 'running', 163, 'Pre-heat the oven'), item(2, 'running', 680, 'Simmer the rice'), item(3, 'running', 900, 'Rest the meat')]
  it('shows only two whole pills; the last carries a "1 more timer. Show all timers" button', async () => {
    const h = strip(three(), { maxPills: 2 })
    expect(screen.getAllByRole('timer')).toHaveLength(2)
    expect(screen.queryByRole('timer', { name: 'Rest the meat' })).not.toBeInTheDocument()
    const last = screen.getByRole('timer', { name: 'Simmer the rice' })
    await userEvent.click(within(last).getByRole('button', { name: '1 more timer. Show all timers' }))
    expect(h.onShowAll).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: /more timer/ })).toHaveLength(1)
  })
  it('one pill of three says "2 more timers"', () => {
    strip(three(), { maxPills: 1 })
    expect(screen.getAllByRole('timer')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '2 more timers. Show all timers' })).toBeInTheDocument()
  })
  it('with one timer there is no "+N"; with no limit all are shown with no "+N"', () => {
    strip([item(1, 'running', 60, 'Eggs')], { maxPills: 1 })
    expect(screen.queryByRole('button', { name: /more timer/ })).not.toBeInTheDocument()
  })
  it('no limit (portrait): every pill, no "+N"', () => {
    strip(three())
    expect(screen.getAllByRole('timer')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /more timer/ })).not.toBeInTheDocument()
  })
  it('the pills are ordered by urgency before the cut: the holding timer is never hidden behind "+N"', () => {
    strip(three(), { maxPills: 2, holdingIds: [3] })
    expect(screen.getAllByRole('timer').map((t) => t.getAttribute('aria-label'))).toEqual(['Rest the meat', 'Pre-heat the oven'])
  })
})

// BR-H: a timer on a Base recipe's Passive Step is labelled "Path · …: text" by the server and shown as sent.
describe('CookTimerStrip: Base recipe timers', () => {
  it('shows a Base recipe Step\'s timer under its label, nested paths included', () => {
    strip([item(1, 'running', 600, 'Béchamel: Simmer the sauce'), item(2, 'running', 120, 'Béchamel · Roux: Rest the roux')])
    expect(screen.getByRole('timer', { name: 'Béchamel: Simmer the sauce' })).toHaveTextContent('10:00')
    expect(screen.getByRole('timer', { name: 'Béchamel · Roux: Rest the roux' })).toHaveTextContent('2:00')
  })
})
