import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkeletonBlock, SkeletonGroup, SkeletonList, SkeletonTile } from './Skeleton'

// B9-20 (RES-02): skeletons in a screen's final shape are composed from one group, blocks, rows and Tiles.
describe('SkeletonGroup', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is one busy status; its blocks, rows and Tiles reserve their space at once and paint together after the delay', () => {
    const { container } = render(
      <SkeletonGroup label="Loading Recipes">
        <SkeletonTile media>
          <SkeletonBlock variant="title" />
        </SkeletonTile>
        <SkeletonList rows={2} />
      </SkeletonGroup>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    const blocks = [...container.querySelectorAll('.skeleton')]
    expect(blocks.length).toBe(1 + 1 + 2 * 3)
    for (const b of blocks) expect(b).toHaveAttribute('data-shown', 'false')
    expect(screen.queryByText('Loading Recipes')).toBeNull()
    act(() => void vi.advanceTimersByTime(301))
    for (const b of container.querySelectorAll('.skeleton')) expect(b).toHaveAttribute('data-shown', 'true')
    expect(screen.getByText('Loading Recipes')).toBeInTheDocument()
  })

  it('a SkeletonTile is a Tile hidden from assistive tech, with a media block in a media Tile', () => {
    const { container } = render(<SkeletonTile media />)
    const tile = container.querySelector('.tile.skeleton-tile')!
    expect(tile).toHaveAttribute('aria-hidden', 'true')
    expect(tile).toHaveAttribute('data-variant', 'media')
    expect(tile.querySelector('.tile__media .skeleton[data-variant="media"]')).not.toBeNull()
  })

  it('a block on its own waits 300 ms by itself', () => {
    const { container } = render(<SkeletonBlock variant="circle" />)
    expect(container.querySelector('.skeleton')).toHaveAttribute('data-shown', 'false')
    act(() => void vi.advanceTimersByTime(301))
    expect(container.querySelector('.skeleton')).toHaveAttribute('data-shown', 'true')
  })
})
