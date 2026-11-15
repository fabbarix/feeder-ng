// B9-44 (TB-03, TB 1, RES-05, RES-09; mock tb-today): TodayView lays Today out itself. A `.today__grid` (a labelled group that is also a
// `.bento-grid`, with no data-min and no data-columns: its columns come from the container, in today.css), one `.today__slot[data-tile]` per tile
// that is shown, each inside a TileErrorBoundary, and one `.today__aside` holding the aside's slots right after To confirm.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { TileId, TodayLayout } from '../types'
import { TodayView } from './TodayView'

const layout = (ids: TileId[], aside: TileId[] = [], extra: Partial<Extract<TodayLayout, { mode: 'today' }>> = {}): TodayLayout => ({
  mode: 'today', empty: false, tiles: ids.map((id) => ({ id })), aside, ...extra,
})
const tiles = Object.fromEntries((['shopping', 'setup', 'nextMeal', 'toConfirm', 'advanceSteps', 'metrics', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon'] as TileId[]).map((id) => [id, <p key={id}>{id} tile</p>]))
const ALL: TileId[] = ['nextMeal', 'toConfirm', 'advanceSteps', 'metrics', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon']
const view = (l: TodayLayout, extra: Partial<Parameters<typeof TodayView>[0]> = {}, client = new QueryClient()) =>
  render(
    <QueryClientProvider client={client}>
      <TodayView layout={l} tiles={tiles} onOpenPlan={() => {}} {...extra} />
    </QueryClientProvider>,
  )

describe('TodayView: the grid (TB-03)', () => {
  it('is a group named "Today" that is a .bento-grid and .today__grid, with no data-min and no data-columns', () => {
    view(layout(ALL, ['advanceSteps', 'metrics']))
    const grid = screen.getByRole('group', { name: 'Today' })
    expect(grid).toHaveClass('today__grid', 'bento-grid')
    expect(grid).not.toHaveAttribute('data-min')
    expect(grid).not.toHaveAttribute('data-columns')
  })

  it('has a slot per tile that is shown, named by id, in DOM order, and none for a tile with nothing to render', () => {
    const { container } = view(layout(ALL, ['advanceSteps', 'metrics']), { tiles: { ...tiles, spoiled: null, useSoon: undefined } })
    expect([...container.querySelectorAll('.today__slot')].map((n) => n.getAttribute('data-tile'))).toEqual(['nextMeal', 'toConfirm', 'advanceSteps', 'metrics', 'couldntPlan', 'leftovers'])
  })

  it('puts the aside’s slots in one .today__aside that follows To confirm; the aside is a direct child of the grid', () => {
    const { container } = view(layout(ALL, ['advanceSteps', 'metrics']))
    const grid = container.querySelector('.today__grid')!
    const aside = grid.querySelector(':scope > .today__aside')!
    expect(aside).not.toBeNull()
    expect([...aside.querySelectorAll('.today__slot')].map((n) => n.getAttribute('data-tile'))).toEqual(['advanceSteps', 'metrics'])
    const order = [...grid.children].map((c) => (c.classList.contains('today__aside') ? 'aside' : c.getAttribute('data-tile')))
    expect(order).toEqual(['nextMeal', 'toConfirm', 'aside', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon'])
  })

  it('has no aside when none of its tiles is shown', () => {
    const { container } = view(layout(['nextMeal', 'toConfirm', 'advanceSteps', 'metrics'], ['advanceSteps', 'metrics']), { tiles: { ...tiles, advanceSteps: null, metrics: null } })
    expect(container.querySelector('.today__aside')).toBeNull()
  })

  it('keeps the grid’s reading order: the aside follows To confirm in the DOM (only CSS order moves the metric strip on a phone)', () => {
    view(layout(ALL, ['advanceSteps', 'metrics']))
    const texts = within(screen.getByRole('group', { name: 'Today' })).getAllByText(/tile$/).map((n) => n.textContent)
    expect(texts).toEqual(['nextMeal tile', 'toConfirm tile', 'advanceSteps tile', 'metrics tile', 'couldntPlan tile', 'spoiled tile', 'leftovers tile', 'useSoon tile'])
  })

  it('shows the shopping tile first, above the hero, without any Shopping List screen (a session is no longer a mode)', () => {
    const { container } = view(layout(['shopping', 'nextMeal']))
    expect([...container.querySelectorAll('.today__slot')].map((n) => n.getAttribute('data-tile'))).toEqual(['shopping', 'nextMeal'])
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
  })
})

describe('TodayView: a crashed tile (RES-09)', () => {
  function Boom(): never {
    throw new Error('bad Planned Meal')
  }
  it('keeps its slot and says so; the other tiles render; the notice names the tile', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = view(layout(ALL, ['advanceSteps', 'metrics']), { tiles: { ...tiles, toConfirm: <Boom /> } })
    const slot = container.querySelector('[data-tile="toConfirm"]') as HTMLElement
    expect(within(slot).getByText('To confirm couldn’t be shown.')).toBeInTheDocument()
    expect(within(slot).getByText(/The rest of Today is fine\./)).toBeInTheDocument()
    expect(screen.getByText('nextMeal tile')).toBeInTheDocument()
    expect(screen.getByText('leftovers tile')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('Try again resets that tile’s queries only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = new QueryClient()
    const reset = vi.spyOn(client, 'resetQueries').mockResolvedValue()
    const { container } = view(layout(ALL, ['advanceSteps', 'metrics']), { tiles: { ...tiles, toConfirm: <Boom /> } }, client)
    await userEvent.click(within(container.querySelector('[data-tile="toConfirm"]') as HTMLElement).getByRole('button', { name: 'Try again' }))
    expect(reset.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey)).toEqual([['plan', 'to-confirm'], ['plan', 'view']])
    spy.mockRestore()
  })
})

describe('TodayView: the date under the title (RES-05)', () => {
  it('shows the Household date it is given', () => {
    view(layout(['nextMeal']), { dateLabel: 'Sun 15 Nov' })
    expect(screen.getByText('Sun 15 Nov')).toBeInTheDocument()
  })
  it('with no date known yet (first launch ever) the subtitle is a reserved skeleton, never a date', () => {
    const { container } = view(layout(['nextMeal']), { dateLabel: null })
    expect(container.querySelector('.page-header__subtitle .skeleton[data-variant="meta"]')).not.toBeNull()
  })
})

describe('TodayView: loading the plan (RES-05)', () => {
  const remembered = { tiles: [{ id: 'nextMeal' as const }, { id: 'toConfirm' as const, rows: 3 }, { id: 'metrics' as const }] }
  it('while the plan has no data shows the remembered shape as a skeleton and none of the tiles, so nothing is inserted above a painted tile', () => {
    const { container } = view(layout(ALL, ['advanceSteps', 'metrics']), { planLoading: true, loading: true, remembered })
    expect(screen.queryByText(/ tile$/)).toBeNull()
    const sk = container.querySelector('.today-skeleton')!
    expect(sk).not.toBeNull()
    expect(sk.querySelector('[data-tile="nextMeal"], .today-skeleton__hero')).not.toBeNull()
    expect(sk.querySelectorAll('.today-skeleton__row')).toHaveLength(3)
    expect(container.querySelector('.today')).toHaveAttribute('aria-busy', 'true')
  })

  it('says "Loading Today" once, to assistive technology, in a status', () => {
    view(layout([]), { planLoading: true, loading: true, remembered })
    const statuses = screen.getAllByRole('status').filter((s) => !s.classList.contains('toast-live'))
    expect(statuses.map((s) => s.textContent?.trim())).toContain('Loading Today')
  })

  it('the skeleton is in the same grid as the tiles will be (the grid and aside keep their places)', () => {
    const { container } = view(layout([]), { planLoading: true, loading: true, remembered })
    expect(container.querySelector('.today__grid .today-skeleton, .today__grid > .today-skeleton')).not.toBeNull()
  })

  it('shows no empty state and no error while the plan loads', () => {
    view(layout([], [], { empty: true }), { planLoading: true, loading: true, remembered })
    expect(screen.queryByText('Nothing on the menu. The kitchen is yours.')).toBeNull()
  })
})
