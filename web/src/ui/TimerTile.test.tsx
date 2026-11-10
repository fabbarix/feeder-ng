import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimerTile } from './TimerTile'

describe('WP3b #14: TimerTile control names carry the timer label', () => {
  it('names each control after the timer, so several timers are distinguishable', () => {
    render(<TimerTile label="Rice" seconds={90} running onToggle={() => {}} onAddMinute={() => {}} onDismiss={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pause Rice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a minute to Rice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss Rice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Rice' })).toBeInTheDocument()
  })

  it('a paused timer offers Resume <label>', () => {
    render(<TimerTile label="Eggs" seconds={30} running={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Resume Eggs' })).toBeInTheDocument()
  })

  it('Cancel and Dismiss are separate controls with their own handlers', async () => {
    const onCancel = vi.fn()
    const onDismiss = vi.fn()
    render(<TimerTile label="Rice" seconds={90} running onCancel={onCancel} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Rice' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Rice' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders only the controls whose handler is given, and none when none is', () => {
    const { container, rerender } = render(<TimerTile label="Rice" seconds={90} running onCancel={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    rerender(<TimerTile label="Rice" seconds={90} running />)
    expect(container.querySelector('.timer-tile__controls')).toBeNull()
  })
})
