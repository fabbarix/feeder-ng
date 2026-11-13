import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import { ShoppingBody } from './ShoppingBody'

// H7': Supply Lines sit after the food Lines under a "Supplies" subheader; Ticked and Not needed keep their groups
// (docs/dev/design/household-items.md §4.4). A list with no Supply Line renders exactly as before.

const base = { system: 'metric' as const, shopName: 'Coop', onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const food = (id: number, name: string, over = {}) => makeLine({ ingredientId: id, name, pack: null, estimatedCostCents: null, quantity: 500, kind: 'food', restock: null, ...over })
const supply = (id: number, name: string, over = {}) =>
  makeLine({ ingredientId: id, name, baseUnit: 'piece', kind: 'supply', restock: { level: 6, stock: 2 }, need: 6, available: 2, quantity: 4, pack: null, estimatedCostCents: null, ...over })
const titles = (list: HTMLElement) => within(list).getAllByRole('listitem').map((r) => r.querySelector('.list-row__title')?.textContent)
const after = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

const mixed = () =>
  makeList({
    lines: [supply(20, 'Toilet paper'), food(1, 'Rice'), supply(21, 'Bin bags', { restock: { level: 20, stock: 0 }, need: 20, available: 0, quantity: 20 })],
    extras: [makeExtra({ id: 5, text: null, ingredientId: 22, name: 'Soap', baseUnit: 'piece', quantity: 2, kind: 'supply' }), makeExtra({ id: 6, text: 'candles', kind: null })],
    progress: { ticked: 0, total: 5 },
  })

describe('ShoppingBody: the Supplies group', () => {
  it('food stays under "To get"; Supply Lines and Supply extras are their own "Supplies" list after it', () => {
    render(<ShoppingBody {...base} list={mixed()} />)
    const toGet = screen.getByRole('list', { name: 'To get' })
    const supplies = screen.getByRole('list', { name: 'Supplies' })
    expect(titles(toGet)).toEqual(['Rice', 'candles'])
    expect(titles(supplies)).toEqual(['Toilet paper', 'Bin bags', 'Soap'])
    after(toGet, supplies)
  })

  it('the subheader is an h2 "Supplies" with a count pill, like "To get" and "Ticked"', () => {
    render(<ShoppingBody {...base} list={mixed()} />)
    const heading = screen.getByRole('heading', { level: 2, name: 'Supplies 3' })
    expect(heading.querySelector('.shop-section__count')).toHaveTextContent('3')
    expect(screen.getByRole('heading', { level: 2, name: 'To get 2' })).toBeInTheDocument()
    after(screen.getByRole('list', { name: 'To get' }), heading)
    after(heading, screen.getByRole('list', { name: 'Supplies' }))
  })

  it('the group is a labelled section (region) that holds the heading and the list, with the Ticked and Not needed groups after it', () => {
    const list = mixed()
    list.lines.push(food(9, 'Salt', { ticked: true, quantity: 0 }))
    list.notNeeded = [food(10, 'Pepper')]
    const { container } = render(<ShoppingBody {...base} list={list} />)
    const region = screen.getByRole('region', { name: /^Supplies/ })
    expect(region).toContainElement(screen.getByRole('heading', { level: 2, name: /^Supplies/ }))
    expect(region).toContainElement(screen.getByRole('list', { name: 'Supplies' }))
    expect(region.className).toContain('shop-supplies')
    expect(container.querySelector('.shop-open')).not.toContainElement(region)
    after(region, screen.getByRole('list', { name: 'Ticked' }))
    after(screen.getByRole('list', { name: 'Ticked' }), screen.getByRole('button', { name: 'Not needed (1)' }))
  })

  it('every row of the group has a real tick button and a real row button, and no native form control is used', () => {
    render(<ShoppingBody {...base} list={mixed()} />)
    const supplies = screen.getByRole('list', { name: 'Supplies' })
    for (const name of ['Toilet paper', 'Bin bags', 'Soap']) {
      expect(within(supplies).getByRole('button', { name })).toBeInTheDocument()
      expect(within(supplies).getByRole('button', { name: `Tick ${name}`, pressed: false }).tagName).toBe('BUTTON')
    }
    expect(supplies.querySelector('input, select, [role=checkbox]')).toBeNull()
  })

  it('shows no "Supplies" heading, region or list when there is no Supply Line (the empty case)', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [food(1, 'Rice')], extras: [makeExtra()] })} />)
    expect(screen.queryByRole('heading', { name: /Supplies/ })).toBeNull()
    expect(screen.queryByRole('region', { name: /Supplies/ })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Supplies' })).toBeNull()
  })

  it('a list of Supplies only has no empty "To get" section and no empty-state', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [supply(20, 'Toilet paper')], progress: { ticked: 0, total: 1 } })} />)
    expect(screen.queryByRole('list', { name: 'To get' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^To get/ })).toBeNull()
    expect(screen.queryByText('Nothing to buy')).toBeNull()
    expect(titles(screen.getByRole('list', { name: 'Supplies' }))).toEqual(['Toilet paper'])
  })

  it('a ticked Supply Line moves to "Ticked" (with the food), and the Supplies group goes when no open one is left', () => {
    const list = makeList({ lines: [supply(20, 'Toilet paper', { ticked: true, quantity: 0, restock: null })], progress: { ticked: 1, total: 1 } })
    render(<ShoppingBody {...base} list={list} />)
    expect(screen.queryByRole('list', { name: 'Supplies' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Ticked' })).getByRole('button', { name: 'Tick Toilet paper', pressed: true })).toBeInTheDocument()
  })

  it('NEW: a ticked Supply Line hides its restock reason (stale once bought) and shows the normal meta', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [supply(20, 'Toilet paper', { ticked: true, quantity: 0 })], progress: { ticked: 1, total: 1 } })} />)
    const row = within(screen.getByRole('list', { name: 'Ticked' })).getByRole('listitem')
    expect(row.querySelector('.list-row__meta')).toBeNull()
    expect(screen.queryByText(/Below/)).toBeNull()
  })

  it('a Not needed Supply Line stays in the Not needed group', async () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [], notNeeded: [supply(20, 'Toilet paper')], progress: { ticked: 0, total: 0 } })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    expect(titles(screen.getByRole('list', { name: 'Not needed' }))).toEqual(['Toilet paper'])
    expect(screen.queryByRole('list', { name: 'Supplies' })).toBeNull()
  })

  it('a Supply both restocked and added by hand shows both rows in the group', () => {
    const list = makeList({
      lines: [supply(20, 'Toilet paper')],
      extras: [makeExtra({ id: 5, text: null, ingredientId: 20, name: 'Toilet paper', baseUnit: 'piece', quantity: 4, kind: 'supply' })],
      progress: { ticked: 0, total: 2 },
    })
    render(<ShoppingBody {...base} list={list} />)
    expect(titles(screen.getByRole('list', { name: 'Supplies' }))).toEqual(['Toilet paper', 'Toilet paper'])
  })
})

describe('ShoppingBody: Restock copy', () => {
  it('a Restock Line says why it is on the list in its one meta line, in the info tone', () => {
    render(<ShoppingBody {...base} list={mixed()} />)
    const row = within(screen.getByRole('list', { name: 'Supplies' })).getAllByRole('listitem')[0]!
    const meta = row.querySelector('.list-row__meta')!
    expect(meta).toHaveTextContent('Below 6 · 2 in Stock')
    expect(meta).toHaveAttribute('data-status', 'info')
    expect(within(screen.getByRole('list', { name: 'Supplies' })).getByText('Below 20 · None in Stock')).toBeInTheDocument()
  })

  it('the row still shows the quantity to buy, and the estimate when there is a Price', () => {
    const list = makeList({ lines: [supply(20, 'Toilet paper', { estimatedCostCents: 450, pack: { productId: 3, name: 'Regina 9', size: 9, count: 1, remainder: 5 } })], progress: { ticked: 0, total: 1 } })
    render(<ShoppingBody {...base} list={list} />)
    const row = screen.getByRole('list', { name: 'Supplies' }).querySelector('li')!
    expect(row).toHaveTextContent('4 pieces')
    expect(row).toHaveTextContent('$4.50')
  })

  it('a Supply extra and a Supply Line without restock info have no "Below" text', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [supply(20, 'Toilet paper', { restock: null })], extras: [makeExtra({ id: 5, text: null, ingredientId: 22, name: 'Soap', baseUnit: 'piece', quantity: 2, kind: 'supply' })], progress: { ticked: 0, total: 2 } })} />)
    expect(screen.queryByText(/Below/)).toBeNull()
  })

  it('food Lines never show a Restock reason, whatever they carry', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [food(1, 'Rice', { restock: { level: 9, stock: 1 } })], progress: { ticked: 0, total: 1 } })} />)
    expect(screen.queryByText(/Below/)).toBeNull()
  })

  it('ticking a Restock Line, and tapping its row, behave as for any Line (the entry carries the ingredient)', async () => {
    const onTick = vi.fn()
    const onOpenLine = vi.fn()
    render(<ShoppingBody {...base} onTick={onTick} onOpenLine={onOpenLine} list={mixed()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tick Toilet paper' }))
    expect(onTick).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ingredientId: 20, kind: 'line', quantity: 4, baseUnit: 'piece', supply: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Toilet paper' }))
    expect(onOpenLine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ingredientId: 20 }), 'open')
  })

  it('a ticked Restock Line can be unticked from the Ticked group', async () => {
    const onUntick = vi.fn()
    render(<ShoppingBody {...base} onUntick={onUntick} list={makeList({ lines: [supply(20, 'Toilet paper', { ticked: true, quantity: 0 })], progress: { ticked: 1, total: 1 } })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tick Toilet paper', pressed: true }))
    expect(onUntick).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ingredientId: 20 }))
  })
})

describe('ShoppingBody: food-only lists render exactly as before', () => {
  it('the same DOM for a list with explicit kind "food" and for one without the new fields', () => {
    const plain = makeList({ lines: [makeLine({ ingredientId: 1, name: 'Rice' }), makeLine({ ingredientId: 2, name: 'Dill', ticked: true, quantity: 0 })], extras: [makeExtra()], progress: { ticked: 1, total: 3 } })
    const tagged = structuredClone(plain)
    tagged.lines.forEach((l) => Object.assign(l, { kind: 'food', restock: null }))
    tagged.extras.forEach((e) => Object.assign(e, { kind: null }))
    const a = render(<ShoppingBody {...base} list={plain} />).container.innerHTML
    document.body.innerHTML = ''
    const b = render(<ShoppingBody {...base} list={tagged} />).container.innerHTML
    expect(b).toBe(a)
    expect(a).not.toContain('shop-supplies')
  })
})
