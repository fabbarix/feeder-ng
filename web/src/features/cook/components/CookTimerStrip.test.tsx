import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../hooks/useTimers'
import type { CookTimer } from '../types'
import { CookTimerStrip } from './CookTimerStrip'

const HERE = 'recipe:12'

function item(id: number, state: CookTimer['state'], seconds: number, label = `Timer ${id}`, scope: string | null = HERE): TimerItem {
  return { seconds, timer: { id, scope, step: null, label, durationSeconds: 600, state, remainingSeconds: seconds, endsAt: null, startedAt: '2026-11-09T18:00:00Z' } }
}

function strip(items: TimerItem[]) {
  const handlers = { onPause: vi.fn(), onResume: vi.fn(), onCancel: vi.fn() }
  render(<CookTimerStrip scope={HERE} items={items} {...handlers} />)
  return handlers
}

describe('CookTimerStrip', () => {
  it('shows every timer as a TimerTile with its time left', () => {
    strip([item(1, 'running', 125, 'Eggs'), item(2, 'paused', 30, 'Rice')])
    expect(screen.getByRole('timer', { name: 'Eggs' })).toHaveTextContent('2:05')
    expect(screen.getByRole('timer', { name: 'Eggs' })).toHaveAttribute('data-state', 'running')
    expect(screen.getByRole('timer', { name: 'Rice' })).toHaveAttribute('data-state', 'paused')
  })

  it('keeps tiles as non-interactive timers: tapping one calls no handler', async () => {
    const h = strip([item(1, 'running', 60, 'Eggs')])
    await userEvent.click(screen.getByRole('timer', { name: 'Eggs' }))
    expect(h.onPause).not.toHaveBeenCalled()
    expect(h.onResume).not.toHaveBeenCalled()
    expect(h.onCancel).not.toHaveBeenCalled()
  })

  it('B14: each TimerTile has its own Pause, Resume and Dismiss controls (icon buttons)', async () => {
    const h = strip([item(1, 'running', 60, 'Eggs'), item(2, 'paused', 30, 'Rice'), item(3, 'finished', 0, 'Pasta')])
    const eggs = within(screen.getByRole('timer', { name: 'Eggs' }))
    const rice = within(screen.getByRole('timer', { name: 'Rice' }))
    const pasta = within(screen.getByRole('timer', { name: 'Pasta' }))
    await userEvent.click(eggs.getByRole('button', { name: 'Pause' }))
    expect(h.onPause).toHaveBeenCalledWith(1)
    await userEvent.click(rice.getByRole('button', { name: 'Resume' }))
    expect(h.onResume).toHaveBeenCalledWith(2)
    await userEvent.click(eggs.getByRole('button', { name: 'Dismiss timer' }))
    expect(h.onCancel).toHaveBeenCalledWith(1)
    await userEvent.click(rice.getByRole('button', { name: 'Dismiss timer' }))
    expect(h.onCancel).toHaveBeenCalledWith(2)
    await userEvent.click(pasta.getByRole('button', { name: 'Dismiss timer' }))
    expect(h.onCancel).toHaveBeenCalledWith(3)
  })

  it('QA: no aria text is printed as visible text (no "Cancel timer Eggs" label on screen)', () => {
    strip([item(1, 'running', 60, 'Eggs'), item(2, 'paused', 30, 'Rice')])
    expect(screen.queryByText(/Cancel timer/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Pause /)).not.toBeInTheDocument()
    screen.getAllByRole('button').forEach((b) => expect(b).toHaveClass('icon-button'))
  })

  it('offers only the controls that fit the state', () => {
    strip([item(1, 'running', 60, 'Eggs'), item(3, 'finished', 0, 'Pasta')])
    const eggs = within(screen.getByRole('timer', { name: 'Eggs' }))
    const pasta = within(screen.getByRole('timer', { name: 'Pasta' }))
    expect(eggs.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    expect(pasta.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  it('B14: timers of other Steps or Recipes are listed apart under "Other timers", with where they belong', () => {
    strip([item(1, 'running', 60, 'Step 2: Simmer', HERE), item(2, 'running', 90, 'Step 1: Boil', 'meal:2026-11-10/3'), item(3, 'running', 20, 'Eggs', null)])
    const here = screen.getByRole('region', { name: 'Timers' })
    const other = screen.getByRole('region', { name: 'Other timers' })
    expect(within(here).getByRole('timer', { name: 'Step 2: Simmer' })).toBeInTheDocument()
    expect(within(other).getByRole('timer', { name: 'Step 1: Boil' })).toBeInTheDocument()
    expect(within(other).getByRole('timer', { name: 'Eggs' })).toBeInTheDocument()
    expect(within(other).getByText('Tue Planned Meal')).toBeInTheDocument()
  })

  it('B14: with no timer for this scope the others still show', () => {
    strip([item(2, 'running', 90, 'Step 1: Boil', 'meal:2026-11-10/3')])
    expect(screen.queryByRole('region', { name: 'Timers' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Other timers' })).toBeInTheDocument()
  })

  it('announces a finished timer', () => {
    strip([item(3, 'finished', 0, 'Pasta')])
    expect(screen.getByText('Pasta is ready')).toBeInTheDocument()
  })

  it('renders nothing without timers', () => {
    const { container } = render(<CookTimerStrip scope={HERE} items={[]} onPause={() => {}} onResume={() => {}} onCancel={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
