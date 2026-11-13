// DS-SHOP: the Shop body is a metric strip, ONE notice, then ONE list of ListRows (a dense list on a phone; the stylesheet turns it
// into a 2-column card grid from 768 px, same rows). Ticked Lines sit in their own section; Not needed stays collapsed.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList, makePast } from '../testData'
import { ShoppingBody } from './ShoppingBody'

const base = { system: 'metric' as const, shopName: 'Coop', onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const line = (id: number, name: string, over = {}) => makeLine({ ingredientId: id, name, quantity: 500, pack: null, estimatedCostCents: null, ...over })
const after = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

describe('ShoppingBody: structure', () => {
  it('metric strip, then the notice, then the list: in that order', () => {
    const list = makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] })
    render(<ShoppingBody {...base} list={list} onMarkIt={() => {}} />)
    const strip = screen.getByRole('group', { name: 'Summary' })
    const notice = screen.getByRole('region', { name: 'Not marked Cooked yet' })
    const rows = screen.getByRole('list', { name: 'To get' })
    after(strip, notice)
    after(notice, rows)
  })

  it('the open Lines and extras are ONE list of rows (one ul), not a grid of separate tiles', () => {
    const list = makeList({ lines: [line(1, 'Dill'), line(2, 'Rice')], extras: [makeExtra()], progress: { ticked: 0, total: 3 } })
    const { container } = render(<ShoppingBody {...base} list={list} />)
    const rows = within(screen.getByRole('list', { name: 'To get' })).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.list-row__title')?.textContent)).toEqual(['Dill', 'Rice', 'toilet paper'])
    expect(container.querySelector('.shop-lines')).toContainElement(screen.getByRole('list', { name: 'To get' }))
    expect(container.querySelector('.line-tile')).toBeNull()
    expect(container.querySelector('[data-columns]')).toBeNull()
  })

  it('every row is a LineRow in the "open" state; a row tap passes the entry and its group to onOpenLine', async () => {
    const onOpenLine = vi.fn()
    render(<ShoppingBody {...base} onOpenLine={onOpenLine} list={makeList()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    expect(onOpenLine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ingredientId: 2, title: 'Passata' }), 'open')
  })

  it('the tick control ticks without opening the sheet', async () => {
    const onTick = vi.fn()
    const onOpenLine = vi.fn()
    render(<ShoppingBody {...base} onTick={onTick} onOpenLine={onOpenLine} list={makeList()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tick Passata' }))
    expect(onTick).toHaveBeenCalledOnce()
    expect(onOpenLine).not.toHaveBeenCalled()
  })

  it('Ticked Lines are a "Ticked" section (count pill 1) with their own list, after the open ones', () => {
    const list = makeList({ lines: [makeLine(), line(4, 'Rice', { ticked: true, quantity: 0 })], progress: { ticked: 1, total: 2 } })
    render(<ShoppingBody {...base} list={list} />)
    const heading = screen.getByRole('heading', { name: 'Ticked 1' })
    const ticked = screen.getByRole('list', { name: 'Ticked' })
    expect(within(ticked).getByRole('button', { name: 'Tick Rice', pressed: true })).toBeInTheDocument()
    expect(within(ticked).getAllByRole('listitem')[0]).toHaveAttribute('data-state', 'ticked')
    after(screen.getByRole('list', { name: 'To get' }), heading)
    after(heading, ticked)
  })

  it('a row sheet from the Ticked section is told its group "ticked"', async () => {
    const onOpenLine = vi.fn()
    const list = makeList({ lines: [line(4, 'Rice', { ticked: true, quantity: 0 })], progress: { ticked: 1, total: 1 } })
    render(<ShoppingBody {...base} onOpenLine={onOpenLine} list={list} />)
    await userEvent.click(screen.getByRole('button', { name: 'Rice' }))
    expect(onOpenLine).toHaveBeenCalledWith(expect.anything(), 'ticked')
  })

  it('has no "To get" list while nothing is open (the empty state speaks instead)', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [], progress: { ticked: 0, total: 0 }, estimatedCostCents: 0 })} />)
    expect(screen.queryByRole('list', { name: 'To get' })).toBeNull()
    expect(screen.getByText('Nothing to buy')).toBeInTheDocument()
  })

  it('exactly one primary action on the page: Scan', () => {
    const list = makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] })
    render(<ShoppingBody {...base} list={list} onMarkIt={() => {}} />)
    const primaries = document.querySelectorAll('button[data-variant="primary"]')
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveTextContent('Scan')
  })
})

describe('ShoppingBody: round 2 section titles', () => {
  it('"To get" and "Ticked" carry a count pill with the number of rows; the list keeps the plain name', () => {
    const list = makeList({ lines: [line(1, 'Dill'), line(2, 'Rice'), line(4, 'Salt', { ticked: true, quantity: 0 })], progress: { ticked: 1, total: 3 } })
    const { container } = render(<ShoppingBody {...base} list={list} />)
    expect(screen.getByRole('heading', { name: 'To get 2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ticked 1' })).toBeInTheDocument()
    expect([...container.querySelectorAll('.shop-section__count')].map((e) => e.textContent)).toEqual(['2', '1'])
    expect(screen.getByRole('list', { name: 'To get' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Ticked' })).toBeInTheDocument()
  })
})

describe('ShoppingBody: the notice is said once', () => {
  const hinted = makeList({
    lines: [makeLine({ pastPlannedMeals: [makePast()] }), line(3, 'Rice', { pastPlannedMeals: [makePast()] }), line(4, 'Dill')],
    progress: { ticked: 0, total: 3 },
  })

  it('the sentence appears once for any number of Lines, and "Mark it" once', () => {
    render(<ShoppingBody {...base} list={hinted} onMarkIt={() => {}} />)
    expect(screen.getAllByText(/marked Cooked yet/)).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Mark it/ })).toHaveLength(1)
  })

  it('round 2: the notice names the slots shortly and in bold, not the Line sentence', () => {
    render(<ShoppingBody {...base} list={hinted} onMarkIt={() => {}} />)
    const region = screen.getByRole('region', { name: 'Not marked Cooked yet' })
    expect(region).toHaveTextContent("Tue Dinner isn't marked Cooked yet")
    expect(region.querySelector('strong')).toHaveTextContent('Tue Dinner')
  })

  it('each affected row carries only the small info marker', () => {
    render(<ShoppingBody {...base} list={hinted} onMarkIt={() => {}} />)
    const rows = within(screen.getByRole('list', { name: 'To get' })).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.list-row__meta')?.getAttribute('data-status') ?? null)).toEqual(['info', 'info', null])
  })

  it('"Mark it" passes the oldest slot', async () => {
    const onMarkIt = vi.fn()
    render(<ShoppingBody {...base} list={hinted} onMarkIt={onMarkIt} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mark it' }))
    expect(onMarkIt).toHaveBeenCalledExactlyOnceWith({ date: '2026-11-03', mealSlotId: 3 })
  })

  it('without onMarkIt the notice is the sentence only', () => {
    render(<ShoppingBody {...base} list={hinted} />)
    expect(screen.getByRole('region', { name: 'Not marked Cooked yet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
  })

  it('no notice for a list without unconfirmed past meals', () => {
    render(<ShoppingBody {...base} list={makeList()} onMarkIt={() => {}} />)
    expect(screen.queryByRole('region', { name: 'Not marked Cooked yet' })).toBeNull()
  })
})
