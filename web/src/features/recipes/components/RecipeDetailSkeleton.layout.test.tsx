// RX-04 (States, "Loading: Skeleton in two columns"): the skeleton is the detail's own layout, so it switches at the same 45 rem container width, and its
// metric Tiles are the metric strip (RX-13) so nothing jumps when the Recipe arrives.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeDetailSkeleton } from './RecipeDetailSkeleton'

describe('RecipeDetailSkeleton layout', () => {
  it('uses the detail layout classes: a side column (hero, metrics, Ingredients) and a main column (Steps, preferences)', () => {
    const { container } = render(<RecipeDetailSkeleton label="Loading…" />)
    const layout = container.querySelector('.recipe-detail__layout') as HTMLElement
    expect(layout.querySelector(':scope > .recipe-detail__aside .recipe-detail__hero')).not.toBeNull()
    expect(layout.querySelector(':scope > .recipe-detail__main')).not.toBeNull()
  })
  it('lays its two metric Tiles out as the metric strip (min="metric"), as RecipeMetrics does', () => {
    const { container } = render(<RecipeDetailSkeleton label="Loading…" />)
    const grid = container.querySelector('.recipe-detail__aside .bento-grid') as HTMLElement
    expect(grid).toHaveAttribute('data-min', 'metric')
    expect(grid.querySelectorAll('.recipe-detail-skeleton__metric')).toHaveLength(2)
  })
})
