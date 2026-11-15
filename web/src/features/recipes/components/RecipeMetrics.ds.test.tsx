// RX-13: system.md 2 and 4: a metric tile is neutral or status-toned, never accent-soft. With a Tomato or Saffron accent a soft tile reads as an alarm.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeMetrics } from './RecipeMetrics'

describe('RecipeMetrics (design system)', () => {
  it('has no data-variant="soft" Tile in the metric strip, for a timed, an untimed and a Base recipe', () => {
    for (const p of [
      { yieldValue: 4, totalMinutes: 37, advanceMinutes: 720, stepCount: 5 },
      { yieldValue: 4, totalMinutes: 0, advanceMinutes: 0, stepCount: 2 },
      { yieldValue: 800, yieldUnit: 'g', baseRecipe: true, totalMinutes: 0, advanceMinutes: 0, stepCount: 0 },
    ]) {
      const { container, unmount } = render(<RecipeMetrics {...p} />)
      expect(container.querySelector('[data-variant="soft"]')).toBeNull()
      expect(container.querySelectorAll('.tile[data-variant="surface"]').length).toBeGreaterThan(0)
      unmount()
    }
  })
  it('uses TileMetric for the numbers (the display role), not ad-hoc overrides', () => {
    const { container } = render(<RecipeMetrics yieldValue={4} totalMinutes={37} advanceMinutes={0} stepCount={5} />)
    expect(container.querySelectorAll('.tile-metric')).toHaveLength(2)
    expect(container.querySelector('.recipe-metric')).toBeNull()
  })
})
