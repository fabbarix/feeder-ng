// DS-TODAY: the metric strip replaces the half-width streak tile (an orphan beside nothing). It is one BentoGrid min="metric"
// (auto-fit, so it fills its row), one status-coloured tile per metric. Replaces StreakTile.test.tsx.
import type { ReactElement } from 'react'
import { render as rtlRender, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { composeMetrics } from '../lib/metrics'
import { MetricStrip } from './MetricStrip'

const all = composeMetrics({ streakDays: 2, leftovers: 3, linesToGet: 16 })

// B9-44 (TB-03, changed on purpose): the strip needs a router (Lines to get is a link to /shop); the icon sits in the value's row.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

describe('MetricStrip', () => {
  it('is one labelled grid by minimum width (metric), with one tile per metric, in order', () => {
    render(<MetricStrip metrics={all} />)
    const grid = screen.getByRole('group', { name: 'At a glance' })
    expect(grid).toHaveAttribute('data-min', 'metric')
    expect([...grid.querySelectorAll('[data-metric]')].map((t) => t.getAttribute('data-metric'))).toEqual(['streak', 'leftovers', 'lines'])
  })

  it('each tile shows the big value and its label, with the icon', () => {
    render(<MetricStrip metrics={all} />)
    const streak = screen.getByText('zero-waste streak').closest('[data-metric]') as HTMLElement
    expect(within(streak).getByText('2 d')).toBeInTheDocument()
    expect(streak.querySelector('svg')).toBeInTheDocument()
    expect(within(screen.getByText('Leftovers to use').closest('[data-metric]') as HTMLElement).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByText('Lines to get').closest('[data-metric]') as HTMLElement).getByText('16')).toBeInTheDocument()
  })

  // B9-44 (TB-03): the icon is in the value's row (flex, space-between) and can never cover the number: it is a sibling of the
  // value inside .today-metric__head, no longer absolutely positioned over the tile.
  it('each tile has its icon and its value in one .today-metric__head row; the icon is aria-hidden and follows the value', () => {
    const { container } = render(<MetricStrip metrics={all} />)
    for (const t of container.querySelectorAll('[data-metric]')) {
      const head = t.querySelector('.today-metric__head')!
      expect(head).not.toBeNull()
      const icon = head.querySelector('.today-metric__icon')!
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon.querySelector('svg')).toBeInTheDocument()
      expect(head.querySelector('.tile-metric__value, .today-metric__value')).not.toBeNull()
      expect(head.firstElementChild).not.toBe(icon)
    }
  })

  it('the streak says "2 days" in full words to assistive technology and "2 d" to the eye', () => {
    const { container } = render(<MetricStrip metrics={all} />)
    const streak = container.querySelector('[data-metric="streak"]') as HTMLElement
    expect(within(streak).getByText('2 days')).toHaveClass('visually-hidden')
    expect(within(streak).getByText('2 d')).toHaveAttribute('aria-hidden', 'true')
  })

  it('colour roles: success for the streak, the leftover teal for Leftovers, a neutral surface tile for Lines (never accent-soft)', () => {
    const { container } = render(<MetricStrip metrics={all} />)
    expect(container.querySelector('[data-metric="streak"]')).toHaveAttribute('data-variant', 'status')
    expect(container.querySelector('[data-metric="streak"]')).toHaveAttribute('data-status', 'success')
    expect(container.querySelector('[data-metric="leftovers"]')).toHaveAttribute('data-status', 'leftover')
    expect(container.querySelector('[data-metric="lines"]')).toHaveAttribute('data-variant', 'surface')
    expect(container.querySelector('[data-variant="soft"]')).toBeNull()
  })

  // B9-44 (TB-03, changed on purpose): "Lines to get" is a link to /shop; the streak and Leftovers stay non-interactive.
  it('no tile spans extra columns; only Lines to get is a link (to /shop); there is no button; the streak is a div', () => {
    const { container } = render(<MetricStrip metrics={all} />)
    for (const t of container.querySelectorAll('[data-metric]')) expect(t).not.toHaveAttribute('data-span', '2')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/shop')
    expect(links[0]).toHaveAccessibleName(/Lines to get/)
    expect(container.querySelector('[data-metric="streak"]')!.tagName).toBe('DIV')
    expect(container.querySelector('[data-metric="streak"] a')).toBeNull()
  })

  it('does not say a label twice and has no heading per metric', () => {
    render(<MetricStrip metrics={all} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getAllByText(/zero-waste streak/i)).toHaveLength(1)
  })

  it('renders only the metrics it is given, and nothing at all for none', () => {
    const { container, rerender } = render(<MetricStrip metrics={all.slice(1)} />)
    expect(container.querySelectorAll('[data-metric]')).toHaveLength(2)
    rerender(<MetricStrip metrics={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('the strip spans the whole row of the Today grid (class today-metrics), whatever the number of metrics', () => {
    const { container } = render(<MetricStrip metrics={all.slice(0, 1)} />)
    expect(container.firstElementChild).toHaveClass('today-metrics')
  })
})
