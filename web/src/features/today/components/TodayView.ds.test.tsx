// DS-TODAY: the Today page follows the system: a grid by minimum width, no "Loading" text, the page inside the shell's Page.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TodayLayout } from '../types'
import { TodayView } from './TodayView'

const layout = (ids: string[]): TodayLayout => ({ mode: 'today', empty: false, tiles: ids.map((id) => ({ id })) as never })
const tiles = { nextMeal: <p>Hero</p>, toConfirm: <p>Confirm</p>, metrics: <p>Metrics</p>, leftovers: <p>Leftovers</p> }
const view = (ids: string[], extra: Partial<Parameters<typeof TodayView>[0]> = {}) =>
  render(<TodayView layout={layout(ids)} tiles={tiles} shopping={<p>Shop</p>} onOpenPlan={() => {}} {...extra} />)

describe('TodayView: the grid', () => {
  it('is a BentoGrid by minimum width ("wide"), never by a column count', () => {
    view(['nextMeal', 'toConfirm', 'metrics'])
    const grid = screen.getByRole('group', { name: 'Today' })
    expect(grid).toHaveAttribute('data-min', 'wide')
    expect(grid).not.toHaveAttribute('data-columns')
  })

  it('the tiles keep their slot wrappers named by id, in layout order (the metric strip included)', () => {
    const { container } = view(['nextMeal', 'toConfirm', 'metrics', 'leftovers'])
    expect([...container.querySelectorAll('[data-tile]')].map((n) => n.getAttribute('data-tile'))).toEqual(['nextMeal', 'toConfirm', 'metrics', 'leftovers'])
  })
})

describe('TodayView: loading', () => {
  it('shows nothing that says "Loading", on any width, and keeps the tiles it has', () => {
    const { container } = view(['nextMeal'], { loading: true })
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(screen.getByText('Hero')).toBeInTheDocument()
  })

  it('todayStrings has no `loading` string any more', async () => {
    const { todayStrings } = await import('../strings')
    expect(todayStrings).not.toHaveProperty('loading')
  })
})

describe('TodayView: the page', () => {
  it('is one section with the page header and the grid, no wrapper that adds its own bottom space', () => {
    const { container } = view(['nextMeal'])
    const section = container.querySelector('section.today')!
    expect(section).toBeInTheDocument()
    expect(section.getAttribute('style') ?? '').not.toMatch(/padding|margin|min-height|height/)
  })
})
