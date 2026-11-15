// B9-40 (PC-03): the sheet a tap on a timer pill (or a rail tile's ⋮) opens: Add 1 minute (secondary), Cancel timer (danger secondary), the R-B Close.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimerItem } from '../hooks/useTimers'
import type { CookTimer } from '../types'
import { CookTimerSheet, type CookTimerSheetProps } from './CookTimerSheet'

const item = (state: CookTimer['state'], seconds: number, over: Partial<CookTimer> = {}): TimerItem => ({
  seconds,
  timer: { id: 5, scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 600, state, remainingSeconds: seconds, endsAt: null, startedAt: '', ...over },
})

function sheet(it: TimerItem | null, extra: Partial<CookTimerSheetProps> = {}) {
  const h = { onClose: vi.fn(), onAddMinute: vi.fn(), onCancel: vi.fn(), onDismiss: vi.fn() }
  render(<CookTimerSheet item={it} scope="recipe:7" {...h} {...extra} />)
  return h
}

describe('CookTimerSheet', () => {
  it('is closed without a timer', () => {
    sheet(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens named after the timer, with its time left and its place', async () => {
    sheet(item('running', 163), { holdsNext: true })
    const dialog = await screen.findByRole('dialog', { name: 'Pre-heat the oven' })
    expect(within(dialog).getByText('2:43')).toBeInTheDocument()
    expect(within(dialog).getByText('Step 1 · next waits for it')).toBeInTheDocument()
  })

  it('a running timer offers Add 1 minute (secondary) and Cancel timer (danger secondary), and one round Close, no Cancel footer', async () => {
    sheet(item('running', 163))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Add 1 minute' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(dialog).getByRole('button', { name: 'Cancel timer' })).toHaveAttribute('data-variant', 'danger-secondary')
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('Add 1 minute adds it and closes the sheet', async () => {
    const h = sheet(item('running', 163))
    await userEvent.click(await screen.findByRole('button', { name: 'Add 1 minute' }))
    expect(h.onAddMinute).toHaveBeenCalledWith(5)
    expect(h.onClose).toHaveBeenCalled()
  })

  it('Cancel timer cancels it and closes the sheet (the Undo toast is the screen\'s)', async () => {
    const h = sheet(item('running', 163))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel timer' }))
    expect(h.onCancel).toHaveBeenCalledWith(5)
    expect(h.onClose).toHaveBeenCalled()
  })

  it('a paused timer has the same two actions', async () => {
    sheet(item('paused', 90))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Add 1 minute' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel timer' })).toBeInTheDocument()
  })

  it('a finished timer has Dismiss only', async () => {
    const h = sheet(item('finished', 0))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Add 1 minute' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cancel timer' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss' }))
    expect(h.onDismiss).toHaveBeenCalledWith(5)
  })

  it('Close closes without acting', async () => {
    const h = sheet(item('running', 163))
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(h.onClose).toHaveBeenCalled()
    expect(h.onAddMinute).not.toHaveBeenCalled()
    expect(h.onCancel).not.toHaveBeenCalled()
  })

  it('another Recipe\'s timer names where it belongs', async () => {
    sheet(item('running', 600, { scope: 'recipe:99', recipeName: 'Beef stew', label: 'Step 2: Slow cook' }))
    const dialog = await screen.findByRole('dialog', { name: 'Slow cook' })
    expect(within(dialog).getByText('Beef stew · Step 2')).toBeInTheDocument()
  })
})
