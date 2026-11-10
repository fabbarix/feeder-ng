import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TodayLayout } from '../types'
import { TodayView } from './TodayView'

const tiles = {
  nextMeal: <p>Chicken curry at 19:30</p>,
  spoiled: <p>Spinach went off</p>,
  leftovers: <p>2 portions of soup</p>,
  streak: <p>5 days</p>,
}
const shopping = <p>Shopping List screen</p>

function layout(ids: Array<[string, string, string]>, empty = false): TodayLayout {
  return { mode: 'today', empty, tiles: ids.map(([id, size, tone]) => ({ id, size, tone })) as never }
}

describe('TodayView', () => {
  it('shows the Shopping List instead of the grid in shopping mode', () => {
    render(<TodayView layout={{ mode: 'shopping' }} tiles={tiles} shopping={shopping} onOpenPlan={() => {}} />)
    expect(screen.getByText('Shopping List screen')).toBeInTheDocument()
    expect(screen.queryByText('Chicken curry at 19:30')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('renders the tiles in layout order inside a labelled Bento grid', () => {
    render(
      <TodayView
        layout={layout([['nextMeal', 'lg', 'accent'], ['spoiled', 'full', 'spoil'], ['leftovers', 'md', 'leftover']])}
        tiles={tiles}
        shopping={shopping}
        onOpenPlan={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    const grid = screen.getByRole('group', { name: 'Today' })
    const texts = within(grid).getAllByText(/./).map((n) => n.textContent)
    expect(texts.indexOf('Chicken curry at 19:30')).toBeLessThan(texts.indexOf('Spinach went off'))
    expect(texts.indexOf('Spinach went off')).toBeLessThan(texts.indexOf('2 portions of soup'))
  })

  it('gives each tile the size and tone of its spec', () => {
    const { container } = render(
      <TodayView layout={layout([['nextMeal', 'lg', 'accent'], ['spoiled', 'full', 'spoil']])} tiles={tiles} shopping={shopping} onOpenPlan={() => {}} />,
    )
    expect(container.querySelector('[data-size="lg"][data-tone="accent"]')).not.toBeNull()
    expect(container.querySelector('[data-size="full"][data-tone="spoil"]')).not.toBeNull()
  })

  it('shows the witty empty state and opens the Plan from its button', async () => {
    const onOpenPlan = vi.fn()
    render(<TodayView layout={layout([], true)} tiles={tiles} shopping={shopping} onOpenPlan={onOpenPlan} />)
    expect(screen.getByRole('heading', { name: 'Nothing on the menu. The kitchen is yours.' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open the Plan' }))
    expect(onOpenPlan).toHaveBeenCalledTimes(1)
  })

  it('still shows the streak tile under the empty state', () => {
    render(<TodayView layout={layout([['streak', 'sm', 'accent']], true)} tiles={tiles} shopping={shopping} onOpenPlan={() => {}} />)
    expect(screen.getByText('Nothing on the menu. The kitchen is yours.')).toBeInTheDocument()
    expect(screen.getByText('5 days')).toBeInTheDocument()
  })

  it('says Loading while data is on its way', () => {
    render(<TodayView layout={layout([])} loading tiles={tiles} shopping={shopping} onOpenPlan={() => {}} />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.queryByText('Nothing on the menu. The kitchen is yours.')).not.toBeInTheDocument()
  })
})
