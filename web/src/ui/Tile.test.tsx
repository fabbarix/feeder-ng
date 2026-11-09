import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BentoGrid } from './BentoGrid'
import { ProgressTile } from './ProgressTile'
import { Tile } from './Tile'
import { TimerTile } from './TimerTile'

describe('Tile', () => {
  it('renders children with default size and tone', () => {
    render(<Tile>Tonight: lasagne</Tile>)
    const el = screen.getByText('Tonight: lasagne')
    expect(el).toHaveAttribute('data-size', 'md')
    expect(el).toHaveAttribute('data-tone', 'neutral')
  })

  it.each(['sm', 'md', 'lg', 'wide', 'full'] as const)('exposes size %s', (size) => {
    render(<Tile size={size}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-size', size)
  })

  it.each(['neutral', 'accent', 'spoil', 'leftover'] as const)('exposes tone %s', (tone) => {
    render(<Tile tone={tone}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-tone', tone)
  })

  it('is not interactive without onClick', () => {
    render(<Tile>plain</Tile>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('becomes a button with onClick, usable by mouse and keyboard', async () => {
    const onClick = vi.fn()
    render(<Tile onClick={onClick}>Open</Tile>)
    const btn = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(btn)
    btn.focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('applies an accessible label', () => {
    render(<Tile aria-label="Dinner tonight">x</Tile>)
    expect(screen.getByLabelText('Dinner tonight')).toBeInTheDocument()
  })
})

describe('BentoGrid', () => {
  it('lays out children and defaults to 2 columns', () => {
    render(<BentoGrid label="Today"><Tile>a</Tile><Tile>b</Tile></BentoGrid>)
    const grid = screen.getByRole('group', { name: 'Today' })
    expect(grid).toHaveAttribute('data-columns', '2')
    expect(grid).toContainElement(screen.getByText('a'))
    expect(grid).toContainElement(screen.getByText('b'))
  })

  it.each([3, 4] as const)('supports %i columns', (columns) => {
    render(<BentoGrid columns={columns} label="g">x</BentoGrid>)
    expect(screen.getByRole('group', { name: 'g' })).toHaveAttribute('data-columns', String(columns))
  })
})

describe('ProgressTile', () => {
  it('exposes progress semantics and a default "value / max" label', () => {
    render(<ProgressTile label="Shopping List" value={3} max={8} />)
    const bar = screen.getByRole('progressbar', { name: 'Shopping List' })
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '8')
    expect(screen.getByText('3 / 8')).toBeInTheDocument()
  })

  it('shows a custom value label', () => {
    render(<ProgressTile label="Shopping List" value={3} max={8} valueLabel="3 of 8 ticked" />)
    expect(screen.getByText('3 of 8 ticked')).toBeInTheDocument()
  })

  it('clamps the value into 0..max', () => {
    const { rerender } = render(<ProgressTile label="p" value={12} max={8} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8')
    rerender(<ProgressTile label="p" value={-2} max={8} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('handles max = 0 without NaN', () => {
    render(<ProgressTile label="p" value={0} max={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('TimerTile', () => {
  it('shows the formatted time in a labelled timer', () => {
    render(<TimerTile label="Simmer sauce" seconds={605} running />)
    const t = screen.getByRole('timer', { name: 'Simmer sauce' })
    expect(t).toHaveTextContent('10:05')
    expect(t).toHaveAttribute('data-state', 'running')
  })

  it('reports paused and expired states', () => {
    const { rerender } = render(<TimerTile label="t" seconds={30} />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'paused')
    rerender(<TimerTile label="t" seconds={0} running />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'expired')
    rerender(<TimerTile label="t" seconds={-5} running />)
    expect(screen.getByRole('timer')).toHaveTextContent('-0:05')
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'expired')
  })
})
