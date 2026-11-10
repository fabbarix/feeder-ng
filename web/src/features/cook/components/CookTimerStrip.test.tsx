import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../hooks/useTimers'
import type { CookTimer } from '../types'
import { CookTimerStrip } from './CookTimerStrip'

function item(id: number, state: CookTimer['state'], seconds: number, label = `Timer ${id}`): TimerItem {
  return { seconds, timer: { id, scope: null, step: null, label, durationSeconds: 600, state, remainingSeconds: seconds, endsAt: null, startedAt: '2026-11-09T18:00:00Z' } }
}

function strip(items: TimerItem[]) {
  const handlers = { onPause: vi.fn(), onResume: vi.fn(), onCancel: vi.fn() }
  render(<CookTimerStrip items={items} {...handlers} />)
  return handlers
}

describe('CookTimerStrip', () => {
  it('shows every timer as a TimerTile with its time left', () => {
    strip([item(1, 'running', 125, 'Eggs'), item(2, 'paused', 30, 'Rice')])
    expect(screen.getByRole('timer', { name: 'Eggs' })).toHaveTextContent('2:05')
    expect(screen.getByRole('timer', { name: 'Eggs' })).toHaveAttribute('data-state', 'running')
    expect(screen.getByRole('timer', { name: 'Rice' })).toHaveAttribute('data-state', 'paused')
  })

  it('pauses a running timer, resumes a paused one and dismisses a finished one by tapping the tile', async () => {
    const h = strip([item(1, 'running', 60, 'Eggs'), item(2, 'paused', 30, 'Rice'), item(3, 'finished', 0, 'Pasta')])
    await userEvent.click(screen.getByRole('timer', { name: 'Eggs' }))
    expect(h.onPause).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByRole('timer', { name: 'Rice' }))
    expect(h.onResume).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByRole('timer', { name: 'Pasta' }))
    expect(h.onCancel).toHaveBeenCalledWith(3)
  })

  it('has explicit Cancel and Dismiss buttons', async () => {
    const h = strip([item(1, 'running', 60, 'Eggs'), item(3, 'finished', 0, 'Pasta')])
    await userEvent.click(screen.getByRole('button', { name: 'Cancel timer Eggs' }))
    expect(h.onCancel).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Pasta' }))
    expect(h.onCancel).toHaveBeenCalledWith(3)
  })

  it('announces a finished timer', () => {
    strip([item(3, 'finished', 0, 'Pasta')])
    expect(screen.getByText('Pasta is ready')).toBeInTheDocument()
  })

  it('renders nothing without timers', () => {
    const { container } = render(<CookTimerStrip items={[]} onPause={() => {}} onResume={() => {}} onCancel={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
