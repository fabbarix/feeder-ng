// DS-TODAY: the metric strip replaces the half-width streak tile (an orphan beside nothing). It is one BentoGrid min="metric"
// (auto-fit, so it fills its row), one status-coloured tile per metric. Replaces StreakTile.test.tsx.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { composeMetrics } from '../lib/metrics'
import { MetricStrip } from './MetricStrip'

const all = composeMetrics({ streakDays: 2, leftovers: 3, linesToGet: 16 })

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

  it('colour roles: success for the streak, the leftover teal for Leftovers, the accent container (soft) for Lines', () => {
    const { container } = render(<MetricStrip metrics={all} />)
    expect(container.querySelector('[data-metric="streak"]')).toHaveAttribute('data-variant', 'status')
    expect(container.querySelector('[data-metric="streak"]')).toHaveAttribute('data-status', 'success')
    expect(container.querySelector('[data-metric="leftovers"]')).toHaveAttribute('data-status', 'leftover')
    expect(container.querySelector('[data-metric="lines"]')).toHaveAttribute('data-variant', 'soft')
  })

  it('no tile spans extra columns (status never changes width) and none is a button or link (the Leftovers tile below owns the tap)', () => {
    const { container } = render(<MetricStrip metrics={all} />)
    for (const t of container.querySelectorAll('[data-metric]')) expect(t).not.toHaveAttribute('data-span', '2')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
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
