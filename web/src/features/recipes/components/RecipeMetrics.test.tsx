// RX-06 (Yield with its unit), RX-07 (untimed Steps are not "No Steps"), RX-13 (metric tiles on surface; the Ready Meal chip left for the hero).
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeMetrics } from './RecipeMetrics'

const props = { yieldValue: 4, totalMinutes: 25, advanceMinutes: 240, stepCount: 3 }
const tiles = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.bento-grid > .tile'))
const value = (t: HTMLElement) => t.querySelector('.tile-metric__value')?.textContent
const label = (t: HTMLElement) => t.querySelector('.tile-metric__label')?.textContent

describe('RecipeMetrics: the strip (RX-13)', () => {
  it('is a metric strip: BentoGrid min="metric", two surface Tiles of value and label', () => {
    const { container } = render(<RecipeMetrics {...props} />)
    const grid = container.querySelector('.bento-grid') as HTMLElement
    expect(grid).toHaveAttribute('data-min', 'metric')
    expect(tiles(container)).toHaveLength(2)
    for (const t of tiles(container)) {
      expect(t).toHaveAttribute('data-variant', 'surface')
      expect(t.querySelector('.tile-metric')).not.toBeNull()
    }
  })
  it('does not carry the Ready Meal chip: it moved to the hero chip line', () => {
    const { container } = render(<RecipeMetrics {...props} />)
    expect(screen.queryByText('Ready Meal')).toBeNull()
    expect(container.querySelector('.chip')).toBeNull()
  })
})

describe('RecipeMetrics: the Yield (RX-06)', () => {
  it('a plannable Recipe: value "4", label "portions per Batch"', () => {
    const { container } = render(<RecipeMetrics {...props} />)
    const t = tiles(container)[0]!
    expect([value(t), label(t)]).toEqual(['4', 'portions per Batch'])
  })
  it('one portion is singular: "1" and "portion per Batch"', () => {
    const { container } = render(<RecipeMetrics {...props} yieldValue={1} />)
    expect([value(tiles(container)[0]!), label(tiles(container)[0]!)]).toEqual(['1', 'portion per Batch'])
  })
  it('a Base recipe of 800 g says "800 g per Batch" and never "portions"', () => {
    const { container } = render(<RecipeMetrics {...props} yieldValue={800} yieldUnit="g" baseRecipe />)
    const t = tiles(container)[0]!
    expect([value(t), label(t)]).toEqual(['800 g', 'per Batch'])
    expect(container).not.toHaveTextContent(/portions/)
  })
  it('a Base recipe in litres and in pieces keeps its own unit', () => {
    const l = render(<RecipeMetrics {...props} yieldValue={1} yieldUnit="l" baseRecipe />)
    expect(value(tiles(l.container)[0]!)).toBe('1 l')
    const p = render(<RecipeMetrics {...props} yieldValue={12} yieldUnit="piece" baseRecipe />)
    expect(value(tiles(p.container)[0]!)).toBe('12 pieces')
  })
  it('a Base recipe whose unit is portion says "8 portions per Batch"', () => {
    const { container } = render(<RecipeMetrics {...props} yieldValue={8} yieldUnit="portion" baseRecipe />)
    const t = tiles(container)[0]!
    expect(t).toHaveTextContent('8 portions per Batch')
  })
})

describe('RecipeMetrics: the time', () => {
  it('a timed Recipe: value "25 min", label "cooking", then "+ 4 h ahead" in meta', () => {
    const { container } = render(<RecipeMetrics {...props} />)
    const t = tiles(container)[1]!
    expect([value(t), label(t)]).toEqual(['25 min', 'cooking'])
    expect(within(t).getByText('+ 4 h ahead')).toHaveClass('recipe-metric__ahead')
    expect(screen.queryByText(/^Total/)).toBeNull()
  })
  it('has no ahead line without an Advance Step', () => {
    render(<RecipeMetrics {...props} advanceMinutes={0} />)
    expect(screen.queryByText(/ahead/)).toBeNull()
  })
  it('a Recipe with no Steps says "No Steps" and shows no ahead line', () => {
    render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={0} stepCount={0} />)
    expect(screen.getByText('No Steps')).toBeInTheDocument()
    expect(screen.queryByText(/ahead/)).toBeNull()
    expect(screen.queryByText('No time set')).toBeNull()
  })
  it('an Advance Step alone keeps the lead metric and says neither "No Steps" nor "No time set"', () => {
    render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={120} stepCount={1} />)
    expect(screen.getByText('+ 2 h ahead')).toBeInTheDocument()
    expect(screen.queryByText('No Steps')).toBeNull()
    expect(screen.queryByText('No time set')).toBeNull()
  })
})

describe('RecipeMetrics: untimed Steps are not "No Steps" (RX-07)', () => {
  it('two untimed Steps: value "No time set", label "2 Steps, none timed"', () => {
    const { container } = render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={0} stepCount={2} />)
    const t = tiles(container)[1]!
    expect([value(t), label(t)]).toEqual(['No time set', '2 Steps, none timed'])
    expect(screen.queryByText('No Steps')).toBeNull()
  })
  it('one untimed Step: label "1 Step, not timed"', () => {
    const { container } = render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={0} stepCount={1} />)
    expect(label(tiles(container)[1]!)).toBe('1 Step, not timed')
  })
  it('keeps the "Not cooked yet" line under it', () => {
    render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={0} stepCount={2} lastCooked="Not cooked yet" />)
    expect(screen.getByText('Not cooked yet')).toBeInTheDocument()
  })
})
