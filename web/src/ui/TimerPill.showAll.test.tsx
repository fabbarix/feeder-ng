// B9-40 (SHORT-01): Cook Mode's landscape strip shows whole pills only, and the last whole pill carries PC-04's "+N" as a button that opens
// the Timers sheet. The shell's pill keeps its aria-hidden badge (the count is in its name); this is the same pill with `onShowAll`.
// NOTE for the developer: ui/TimerPill.tsx, TimerPill.css and TimerPill.strings.ts are outside B9-40's own files; the batch lead allows the edit.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimerPill } from './TimerPill'

const pill = (props: Partial<React.ComponentProps<typeof TimerPill>> = {}) =>
  render(<TimerPill label="Simmer the rice" seconds={680} onOpen={() => {}} {...props} />)

describe('TimerPill onShowAll (the "+N" as a button)', () => {
  it('is a button named "1 more timer. Show all timers" that calls onShowAll', async () => {
    const onShowAll = vi.fn()
    pill({ more: 1, onShowAll, onToggle: () => {} })
    const timer = screen.getByRole('timer', { name: 'Simmer the rice' })
    const more = within(timer).getByRole('button', { name: '1 more timer. Show all timers' })
    expect(more).toHaveTextContent('+1')
    expect(more).toHaveClass('timer-pill__more')
    await userEvent.click(more)
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })
  it('the plural is "2 more timers. Show all timers"', () => {
    pill({ more: 2, onShowAll: () => {} })
    expect(screen.getByRole('button', { name: '2 more timers. Show all timers' })).toBeInTheDocument()
  })
  it('is a sibling of the open button (a button never nests in a button), before the Pause button', () => {
    pill({ more: 1, onShowAll: () => {}, onToggle: () => {} })
    const open = screen.getByRole('button', { name: /^Timer: Simmer the rice/ })
    const more = screen.getByRole('button', { name: '1 more timer. Show all timers' })
    expect(open.contains(more)).toBe(false)
    expect(open.querySelector('.timer-pill__more')).toBeNull()
    const order = [...screen.getByRole('timer').querySelectorAll('button')].map((b) => b.className)
    expect(order.findIndex((c) => c.includes('timer-pill__more'))).toBeLessThan(order.findIndex((c) => c.includes('timer-pill__toggle')))
  })
  it('opening the timer still opens it, and the count is not in the open button\'s name twice', async () => {
    const onOpen = vi.fn()
    pill({ more: 1, onShowAll: () => {}, onOpen })
    await userEvent.click(screen.getByRole('button', { name: /^Timer: Simmer the rice/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /^Timer: Simmer the rice/ }).getAttribute('aria-label')).not.toMatch(/and 1 more/)
  })
  it('without onShowAll the badge is the aria-hidden "+N" of the shell\'s pill, unchanged', () => {
    pill({ more: 1 })
    expect(screen.queryByRole('button', { name: /more timer/ })).not.toBeInTheDocument()
    expect(screen.getByRole('timer').querySelector('.timer-pill__more')).toHaveAttribute('aria-hidden', 'true')
  })
  it('with no other timers there is no "+N" even with onShowAll', () => {
    pill({ more: 0, onShowAll: () => {} })
    expect(screen.queryByRole('button', { name: /more timer/ })).not.toBeInTheDocument()
  })
})

describe('TimerPill opensOptions (Cook Mode: the open button shows the timer\'s sheet)', () => {
  it('names the open button "Timer: <label>, <time>. Show options", never "Open Cook Mode"', () => {
    pill({ opensOptions: true })
    expect(screen.getByRole('button', { name: 'Timer: Simmer the rice, 11:20. Show options' })).toBeInTheDocument()
  })
  it('a finished timer reads "Timer finished: <label>. Show options"', () => {
    pill({ opensOptions: true, seconds: 0 })
    expect(screen.getByRole('button', { name: 'Timer finished: Simmer the rice. Show options' })).toBeInTheDocument()
  })
  it('without it the shell\'s name stays "… Open Cook Mode"', () => {
    pill()
    expect(screen.getByRole('button', { name: 'Timer: Simmer the rice, 11:20. Open Cook Mode' })).toBeInTheDocument()
  })
})
