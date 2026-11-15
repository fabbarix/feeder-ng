// B9-40 (DS-06, decision DS 3, PC-03, SHORT-01): the Advance Steps are info, never warn or spoil; one info line after the first Step; a chip and a
// sheet in short landscape.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdvanceGroup } from '../lib/timeline'
import type { AdvanceItem, TimelineAdvance } from '../types'
import { AdvanceStepsTile } from './AdvanceStepsTile'
import { TimelineAdvanceTile } from './TimelineAdvanceTile'

const done: AdvanceItem = { step: 0, text: 'Marinate the chicken', leadTimeMinutes: 240, done: true, doneAt: '2026-11-09T08:00:00Z', warning: false }
const pending: AdvanceItem = { step: 3, text: 'Soak the beans', leadTimeMinutes: 480, done: false, doneAt: null, warning: true }
const pending2: AdvanceItem = { step: 5, text: 'Make the stock', leadTimeMinutes: 120, done: false, doneAt: null, warning: true }

describe('AdvanceStepsTile tone (DS 3: the Advance Steps tiles use info)', () => {
  it('is an info status tile, with the Alarm icon in its heading', () => {
    const { container } = render(<AdvanceStepsTile summary={{ done: [], pending: [pending] }} onMarkDone={() => {}} />)
    const tile = container.querySelector('.cook-advance')!
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'info')
    expect(tile.querySelector('h2 svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { name: 'Advance Steps' })).toBeInTheDocument()
  })
  it('an overdue Advance Step stays info (lateness is never red, peach or mustard)', () => {
    const { container } = render(<AdvanceStepsTile summary={{ done: [], pending: [{ ...pending, warning: true }] }} onMarkDone={() => {}} />)
    expect(container.querySelector('[data-status="warn"], [data-status="spoil"], [data-status="danger"]')).toBeNull()
  })
  it('its Done button is an outlined secondary button', () => {
    render(<AdvanceStepsTile summary={{ done: [], pending: [pending] }} onMarkDone={() => {}} />)
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('data-variant', 'secondary')
  })
})

describe('AdvanceStepsTile collapsed (PC-03: after the first Step, one info line)', () => {
  it('shows a single line, no list, no heading, no button', () => {
    const { container } = render(<AdvanceStepsTile collapsed summary={{ done: [done], pending: [] }} onMarkDone={() => {}} />)
    const line = container.querySelector('.cook-advance-line')!
    expect(line).toHaveTextContent('Advance Step done: Marinate the chicken')
    expect(line).toHaveAttribute('data-status', 'info')
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('says what is still to do when something is', () => {
    const { container } = render(<AdvanceStepsTile collapsed summary={{ done: [], pending: [pending, pending2] }} onMarkDone={() => {}} />)
    expect(container.querySelector('.cook-advance-line')).toHaveTextContent('2 Advance Steps to do')
  })
  it('renders nothing without Advance Steps', () => {
    const { container } = render(<AdvanceStepsTile collapsed summary={{ done: [], pending: [] }} onMarkDone={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Scenario: The Advance Steps chip opens the Advance Steps and marks one done (AdvanceStepsTile compact)', () => {
  it('is a button named "Advance Steps: 2 to do" with a dialog popup, and no tile', () => {
    const { container } = render(<AdvanceStepsTile compact summary={{ done: [], pending: [pending, pending2] }} onMarkDone={() => {}} />)
    const chip = screen.getByRole('button', { name: 'Advance Steps: 2 to do' })
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog')
    expect(chip).toHaveClass('cook-advance-chip')
    expect(container.querySelector('.tile')).toBeNull()
  })
  it('shows "2 Advance Steps to do" and a count-only twin that is hidden from assistive technology (CSS picks which one shows)', () => {
    render(<AdvanceStepsTile compact summary={{ done: [], pending: [pending, pending2] }} onMarkDone={() => {}} />)
    const chip = screen.getByRole('button', { name: 'Advance Steps: 2 to do' })
    expect(chip.querySelector('.cook-advance-chip__long')).toHaveTextContent('2 Advance Steps to do')
    const short = chip.querySelector('.cook-advance-chip__short')!
    expect(short).toHaveTextContent('2')
    expect(short).toHaveAttribute('aria-hidden', 'true')
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('the chip is an info chip: it has no warn, spoil or danger tone', () => {
    render(<AdvanceStepsTile compact summary={{ done: [], pending: [pending] }} onMarkDone={() => {}} />)
    const chip = screen.getByRole('button', { name: 'Advance Steps: 1 to do' })
    expect(chip.getAttribute('data-status')).toBe('info')
  })
  it('pressing it opens a sheet "Advance Steps" with the rows and their Done buttons; Done marks one by its Recipe Step index', async () => {
    const onMarkDone = vi.fn()
    render(<AdvanceStepsTile compact summary={{ done: [done], pending: [pending] }} onMarkDone={onMarkDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Advance Steps: 1 to do' }))
    const sheet = await screen.findByRole('dialog', { name: 'Advance Steps' })
    expect(within(sheet).getByText('Soak the beans · 8 h ahead')).toBeInTheDocument()
    expect(within(sheet).getByText('Done: Marinate the chicken')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(onMarkDone).toHaveBeenCalledWith(3)
  })
  it('closing the sheet returns focus to the chip', async () => {
    render(<AdvanceStepsTile compact summary={{ done: [], pending: [pending] }} onMarkDone={() => {}} />)
    const chip = screen.getByRole('button', { name: 'Advance Steps: 1 to do' })
    await userEvent.click(chip)
    const sheet = await screen.findByRole('dialog', { name: 'Advance Steps' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chip).toHaveFocus()
  })
  it('when none is left to do the chip is absent', () => {
    const { container } = render(<AdvanceStepsTile compact summary={{ done: [done], pending: [] }} onMarkDone={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

const tl = (over: Partial<TimelineAdvance> = {}): TimelineAdvance => ({ courseId: 1, scope: 'meal:2026-11-10/4/1', step: 0, text: 'Marinate the chicken', leadTimeMinutes: 240, done: false, doneAt: null, warning: true, ...over })
const group = (items: TimelineAdvance[]): AdvanceGroup => ({ courseId: 1, courseName: 'Main', named: false, items })

describe('TimelineAdvanceTile (the Timeline uses the same tone and chip)', () => {
  it('is an info status tile', () => {
    const { container } = render(<TimelineAdvanceTile groups={[group([tl()])]} onMarkDone={() => {}} />)
    expect(container.querySelector('.cook-advance')).toHaveAttribute('data-status', 'info')
  })
  it('compact: the chip counts the undone Advance Steps of every Course and its sheet marks one done with its own scope', async () => {
    const onMarkDone = vi.fn()
    render(<TimelineAdvanceTile compact groups={[group([tl(), tl({ step: 2, text: 'Soak the beans', done: true, doneAt: 'x' })]), { ...group([tl({ courseId: 2, scope: 'meal:2026-11-10/4/2', step: 1, text: 'Make the stock' })]), courseId: 2, courseName: 'Side' }]} onMarkDone={onMarkDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Advance Steps: 2 to do' }))
    const sheet = await screen.findByRole('dialog', { name: 'Advance Steps' })
    const buttons = within(sheet).getAllByRole('button', { name: 'Done' })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[1]!)
    expect(onMarkDone).toHaveBeenCalledWith('meal:2026-11-10/4/2', 1)
  })
})
