// DS-TODAY: the Today page follows the system: a grid by minimum width, no "Loading" text, the page inside the shell's Page.
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TodayLayout } from '../types'
import { TodayView } from './TodayView'

// B9-44 (RES-09): every tile sits in a TileErrorBoundary, which needs the QueryClient.
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const layout = (ids: string[]): TodayLayout => ({ mode: 'today', empty: false, tiles: ids.map((id) => ({ id })) as never, aside: [] })
const tiles = { nextMeal: <p>Hero</p>, toConfirm: <p>Confirm</p>, metrics: <p>Metrics</p>, leftovers: <p>Leftovers</p> }
const view = (ids: string[], extra: Partial<Parameters<typeof TodayView>[0]> = {}) =>
  render(<TodayView layout={layout(ids)} tiles={tiles} onOpenPlan={() => {}} {...extra} />)

describe('TodayView: the grid', () => {
  // B9-44 (TB-03, changed on purpose): Today composes its own grid by container width (ADR 0026): no data-min any more.
  it('is a labelled group on the page’s own grid, never by a column count and no longer by a BentoGrid minimum', () => {
    view(['nextMeal', 'toConfirm', 'metrics'])
    const grid = screen.getByRole('group', { name: 'Today' })
    expect(grid).toHaveClass('today__grid')
    expect(grid).not.toHaveAttribute('data-min')
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
