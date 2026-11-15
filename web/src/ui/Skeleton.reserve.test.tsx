import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Skeleton } from './Skeleton'
import { declarations, readUiCss } from './test-utils'

// B9-20 (RES-02): a Skeleton reserves its size from the first frame; only the shimmer (and the announcement) wait for delayMs.
describe('Skeleton reserves space', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders every block on the first frame, unpainted (data-shown="false")', () => {
    const { container } = render(<Skeleton variant="tile" count={3} />)
    const blocks = container.querySelectorAll('.skeleton')
    expect(blocks).toHaveLength(3)
    for (const b of blocks) expect(b).toHaveAttribute('data-shown', 'false')
  })

  it('after delayMs the same blocks are painted (data-shown="true"): none is added or removed, so nothing moves', () => {
    const { container } = render(<Skeleton variant="row" count={2} />)
    const before = [...container.querySelectorAll('.skeleton')]
    act(() => void vi.advanceTimersByTime(301))
    const after = [...container.querySelectorAll('.skeleton')]
    expect(after).toEqual(before)
    for (const b of after) expect(b).toHaveAttribute('data-shown', 'true')
  })

  it('delayMs 0 is painted after the first effect', () => {
    const { container } = render(<Skeleton delayMs={0} />)
    act(() => void vi.advanceTimersByTime(1))
    expect(container.querySelector('.skeleton')).toHaveAttribute('data-shown', 'true')
  })

  it('the "Loading" status is announced only once the blocks are painted: a fast load announces nothing', () => {
    render(<Skeleton label="Loading Recipes" />)
    expect(screen.queryByText('Loading Recipes')).toBeNull()
    act(() => void vi.advanceTimersByTime(301))
    expect(screen.getAllByText('Loading Recipes')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })

  it('has the new variants card, hero, title and meta', () => {
    const { container } = render(
      <>
        <Skeleton variant="card" />
        <Skeleton variant="hero" />
        <Skeleton variant="title" />
        <Skeleton variant="meta" />
      </>,
    )
    expect([...container.querySelectorAll('.skeleton')].map((e) => e.getAttribute('data-variant'))).toEqual(['card', 'hero', 'title', 'meta'])
  })

  it('the blocks stay decorative', () => {
    const { container } = render(<Skeleton count={2} />)
    for (const b of container.querySelectorAll('.skeleton')) expect(b).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Skeleton.css (the mock\'s proposed block)', () => {
  const css = readUiCss('Skeleton.css')
  it('an unpainted block keeps its box but has no fill and no animation', () => {
    const d = declarations(css, ".skeleton[data-shown='false']")
    expect(d['background']).toBe('transparent')
    expect(d['animation']).toBe('none')
  })
  it('hero reserves --skeleton-hero (193 px default), title 28 px, meta 18 px by 7em, card is 4 / 3', () => {
    expect(declarations(css, ".skeleton[data-variant='hero']")['block-size']).toBe('var(--skeleton-hero, 193px)')
    expect(declarations(css, ".skeleton[data-variant='title']")['block-size']).toBe('28px')
    const meta = declarations(css, ".skeleton[data-variant='meta']")
    expect(meta['block-size']).toBe('18px')
    expect(meta['inline-size']).toBe('7em')
    expect(declarations(css, ".skeleton[data-variant='card']")['aspect-ratio']).toBe('4 / 3')
  })
  it('--skeleton-hero is 208 px from 600 px and 220 px from 1024 px', () => {
    expect(css).toMatch(/@media[^{]*600px[^{]*\{[^}]*--skeleton-hero:\s*208px/)
    expect(css).toMatch(/@media[^{]*1024px[^{]*\{[^}]*--skeleton-hero:\s*220px/)
  })
})
