import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('paints nothing for the first 300 ms, then the blocks', () => {
    const { container } = render(<Skeleton variant="tile" count={3} />)
    expect(container.querySelectorAll('.skeleton')).toHaveLength(0)
    act(() => void vi.advanceTimersByTime(299))
    expect(container.querySelectorAll('.skeleton')).toHaveLength(0)
    act(() => void vi.advanceTimersByTime(2))
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
    expect(container.querySelector('.skeleton')).toHaveAttribute('data-variant', 'tile')
  })

  it('honours delayMs, including 0', () => {
    const { container } = render(<Skeleton delayMs={0} />)
    act(() => void vi.advanceTimersByTime(1))
    expect(container.querySelectorAll('.skeleton')).toHaveLength(1)
  })

  it('announces Loading once to assistive tech while the blocks are decorative', () => {
    const { container } = render(<Skeleton count={4} delayMs={0} label="Loading the plan" />)
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getAllByText('Loading the plan')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    for (const block of container.querySelectorAll('.skeleton')) expect(block).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not paint if unmounted before the delay (no late update)', () => {
    const { unmount } = render(<Skeleton />)
    unmount()
    expect(() => act(() => void vi.advanceTimersByTime(1000))).not.toThrow()
  })
})
