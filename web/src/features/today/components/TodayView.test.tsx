import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TodayLayout } from '../types'
import { TodayView } from './TodayView'

// B9-44 (RES-09): every tile sits in a TileErrorBoundary, which needs the QueryClient.
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const tiles = {
  nextMeal: <p>Chicken curry at 19:30</p>,
  spoiled: <p>Spinach went off</p>,
  leftovers: <p>2 portions of soup</p>,
  metrics: <p>5 days</p>, // DS-TODAY: the streak tile became the metric strip (tile id 'metrics')
}

function layout(ids: string[], empty = false): TodayLayout {
  return { mode: 'today', empty, tiles: ids.map((id) => ({ id })) as never, aside: [] }
}

describe('TodayView', () => {
  // B9-44 (TB-12, removed on purpose): there is no shopping mode any more; the session is a tile (TodayView.tb03.test.tsx).

  it('renders the tiles in layout order inside a labelled Bento grid', () => {
    render(
      <TodayView
        layout={layout(['nextMeal', 'spoiled', 'leftovers'])}
        tiles={tiles}
       
        onOpenPlan={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    const grid = screen.getByRole('group', { name: 'Today' })
    const texts = within(grid).getAllByText(/./).map((n) => n.textContent)
    expect(texts.indexOf('Chicken curry at 19:30')).toBeLessThan(texts.indexOf('Spinach went off'))
    expect(texts.indexOf('Spinach went off')).toBeLessThan(texts.indexOf('2 portions of soup'))
  })

  it('wraps each tile in a slot named by its id', () => {
    const { container } = render(<TodayView layout={layout(['nextMeal', 'spoiled'])} tiles={tiles} onOpenPlan={() => {}} />)
    expect(container.querySelector('[data-tile="nextMeal"]')).not.toBeNull()
    expect(container.querySelector('[data-tile="spoiled"]')).not.toBeNull()
  })

  it('puts the date under the title when given', () => {
    render(<TodayView layout={layout(['nextMeal'])} dateLabel="Tue 10 Nov" tiles={tiles} onOpenPlan={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByText('Tue 10 Nov')).toBeInTheDocument()
  })

  it('shows the witty empty state and opens the Plan from its button', async () => {
    const onOpenPlan = vi.fn()
    render(<TodayView layout={layout([], true)} tiles={tiles} onOpenPlan={onOpenPlan} />)
    expect(screen.getByRole('heading', { name: 'Nothing on the menu. The kitchen is yours.' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open the Plan' }))
    expect(onOpenPlan).toHaveBeenCalledTimes(1)
  })

  it('still shows the metric strip under the empty state', () => {
    render(<TodayView layout={layout(['metrics'], true)} tiles={tiles} onOpenPlan={() => {}} />)
    expect(screen.getByText('Nothing on the menu. The kitchen is yours.')).toBeInTheDocument()
    expect(screen.getByText('5 days')).toBeInTheDocument()
  })

  // DS-TODAY (changed on purpose): no "Loading" text (it stayed visible above the content on a phone). The section says it is
  // busy to assistive technology (aria-busy) and Today shows no empty state meanwhile.
  it('while data is on its way there is no visible "Loading" text, the section is aria-busy and no empty state shows', () => {
    const { container } = render(<TodayView layout={layout([])} loading tiles={tiles} onOpenPlan={() => {}} />)
    expect(screen.queryByText('Loading')).not.toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    expect(container.querySelector('.today')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.today__muted')).toBeNull()
    expect(screen.queryByText('Nothing on the menu. The kitchen is yours.')).not.toBeInTheDocument()
  })

  it('is not aria-busy once loaded', () => {
    const { container } = render(<TodayView layout={layout(['nextMeal'])} tiles={tiles} onOpenPlan={() => {}} />)
    expect(container.querySelector('.today')).not.toHaveAttribute('aria-busy', 'true')
  })

  // DS-TODAY (changed on purpose): replaces "passes the hero span from the layout (data-hero-span)": the hero is always the
  // full row, so there is no hero span to pass and no 3-column dense back-fill.
  it('has no data-hero-span: the hero always takes the whole row', () => {
    const { container } = render(<TodayView layout={layout(['nextMeal', 'metrics'])} tiles={tiles} onOpenPlan={() => {}} />)
    expect(container.querySelector('[data-hero-span]')).toBeNull()
  })

  it('shows an error with a retry, never the empty state, when the layout failed', async () => {
    const onRetry = vi.fn()
    render(<TodayView layout={{ ...(layout([], false) as Extract<TodayLayout, { mode: 'today' }>), failed: true }} tiles={tiles} onOpenPlan={() => {}} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Today could not be loaded.')
    expect(screen.queryByRole('heading', { name: 'Nothing on the menu. The kitchen is yours.' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
