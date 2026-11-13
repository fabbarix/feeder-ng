// SR4: ScannedRow is a ListRow of the Scanned list (shop-scan-proposals.md 13.3). It renders a SR3 row model: the Thumb
// (or monogram), the name without the pack size, rowMeta (size · tick x of y), rowAmounts, "Add price", and for the active
// row one strip under it: the compact Stepper, Price and Remove (no ⋮ menu since the mockup review).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { formatMinor } from '../../products/lib/money'
import { buildScannedRows, rowAmounts, rowMeta, type ScannedRow as RowModel, type SessionEntry } from '../lib/scannedList'
import { applied, cheese, passata, products, queued, toiletPaper } from '../lib/scannedList.testData'
import { scanStrings } from '../strings'
import { ScannedRow, type ScannedRowProps } from './ScannedRow'

const rowFrom = (...entries: SessionEntry[]): RowModel => buildScannedRows(entries, products)[0]!
const muttiTicked = rowFrom(
  applied('u-1', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true }),
  applied('u-2', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true }),
)
const muttiToGet = rowFrom(applied('u-1', passata, { priceCents: 89 }, { priceCents: 89, onList: true, remaining: 700 }))
const notOnList = rowFrom(applied('u-1', passata, { priceCents: 129 }, { priceCents: 129 }))
const paperNoPrice = rowFrom(applied('u-3', toiletPaper, {}, { onList: true, ticked: true }))
const loose = rowFrom(applied('u-4', cheese, { quantity: 312, weighed: true, priceCents: 624, pricePerKgCents: 2000 }, { quantity: 312, priceCents: 624, onList: true, ticked: true, productImageUrl: '/api/images/cheese' }))
const waiting = rowFrom(queued('q-1', passata, { priceCents: 129 }))

function setup(row: RowModel, over: Partial<ScannedRowProps> = {}) {
  const props: ScannedRowProps = {
    row,
    currency: 'USD',
    system: 'metric',
    active: false,
    pricing: false,
    onActivate: vi.fn(),
    onPrice: vi.fn(),
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  }
  const view = render(
    <MemoryRouter>
      <ul>
        <ScannedRow {...props} />
      </ul>
    </MemoryRouter>,
  )
  return { props, item: screen.getByRole('listitem'), ...view }
}
const money = (c: number) => formatMinor(c, 'USD')

describe('ScannedRow: what it shows', () => {
  it('is a list item whose target is a real button named after the Product', async () => {
    const { props, item } = setup(muttiTicked)
    await userEvent.click(within(item).getByRole('button', { name: 'Mutti passata 700 g' }))
    expect(props.onActivate).toHaveBeenCalledTimes(1)
  })

  it('line 1 is the Product name without the pack size the second line shows', () => {
    const { item } = setup(muttiTicked)
    expect(item.querySelector('.list-row__title')).toHaveTextContent(/^Mutti passata$/)
  })

  it('line 2 is the size, then the Line it covers, from rowMeta; the amounts come from rowAmounts', () => {
    const { item } = setup(muttiTicked)
    const meta = rowMeta(muttiTicked, 'metric')
    expect(meta).toEqual({ size: '700 g', cover: { text: '1400 of 1400 g', done: true }, waiting: false })
    expect(item.querySelector('.list-row__meta')).toHaveTextContent(/^700 g·1400 of 1400 g$/)
    const amounts = rowAmounts(muttiTicked, money)
    expect(within(item).getByText(amounts.value!)).toBeInTheDocument()
    expect(within(item).getByText(amounts.sub)).toBeInTheDocument()
    expect(amounts).toEqual({ value: '$2.58', sub: '×2 · $1.29' })
  })

  it('a Line still partly to get, a row not on the list (the size only), and a row waiting to sync', () => {
    expect(setup(muttiToGet).item.querySelector('.list-row__meta')).toHaveTextContent(/^700 g·700 of 1400 g$/)
    document.body.innerHTML = ''
    expect(setup(notOnList).item.querySelector('.list-row__meta')).toHaveTextContent(/^700 g$/)
    document.body.innerHTML = ''
    expect(setup(waiting).item.querySelector('.list-row__meta')).toHaveTextContent(/^700 g·Waiting to sync$/)
  })

  it('never says "On the list", "ticked", "still to get" or "Not on the list"', () => {
    for (const row of [muttiTicked, muttiToGet, notOnList, paperNoPrice, loose, waiting]) {
      document.body.innerHTML = ''
      expect(setup(row).item.textContent).not.toMatch(/on the list|ticked|still to get/i)
    }
  })

  it('a weighed row shows its weight and its Price per kg, no ×', () => {
    const { item } = setup(loose)
    expect(item.querySelector('.list-row__meta')).toHaveTextContent(/^312 g·312 of 312 g$/)
    expect(item).toHaveTextContent('$6.24')
    expect(item).toHaveTextContent('$20.00/kg')
    expect(item.textContent).not.toMatch(/×/)
  })

  it('draws the Picture, or a monogram when there is none', () => {
    const withPicture = setup(loose)
    expect(withPicture.item.querySelector('img')).toHaveAttribute('src', '/api/images/cheese')
    withPicture.unmount()
    const bare = setup(notOnList)
    expect(bare.item.querySelector('img')).toBeNull()
    expect(bare.item).toHaveTextContent('M')
  })

  it('has no Price: an "Add price" button instead of the amount, still showing ×N', async () => {
    const { props, item } = setup(paperNoPrice)
    await userEvent.click(within(item).getByRole('button', { name: /^Add price/ }))
    expect(props.onPrice).toHaveBeenCalledTimes(1)
    expect(item).toHaveTextContent('×1')
    expect(item.textContent).not.toMatch(/\$/)
  })

  it('a priced row shows its Price as plain text on the right; the Price entry starts from the active row\'s strip', async () => {
    const { props, item } = setup(muttiTicked)
    expect(item.querySelector('.list-row__value')).toHaveTextContent('$2.58×2 · $1.29')
    expect(within(item).queryByRole('button', { name: /^Price of/ })).toBeNull()
    document.body.innerHTML = ''
    const active = setup(muttiTicked, { active: true })
    const price = within(active.item).getByRole('button', { name: 'Price of Mutti passata 700 g…' })
    expect(price).toHaveTextContent(/^Price$/)
    await userEvent.click(price)
    expect(active.props.onPrice).toHaveBeenCalledTimes(1)
    expect(active.props.onActivate).not.toHaveBeenCalled()
    expect(props.onPrice).not.toHaveBeenCalled()
  })

  it('a priced row has no "Add price"', () => {
    expect(within(setup(notOnList).item).queryByRole('button', { name: /^Add price/ })).toBeNull()
  })
})

describe('ScannedRow: the Shopping List match shows one tick', () => {
  const tickOf = (row: RowModel) => {
    document.body.innerHTML = ''
    const { item } = setup(row)
    const ticks = item.querySelectorAll('.list-row__meta svg')
    expect(ticks).toHaveLength(1)
    expect(ticks[0]).toHaveClass('scanned-row__tick')
    return ticks[0]!.innerHTML
  }

  it('a matched row has exactly one tick, on the second line, and no badge on the Thumb', () => {
    for (const row of [muttiTicked, muttiToGet, loose]) {
      document.body.innerHTML = ''
      const { item } = setup(row)
      expect(item.querySelectorAll('.list-row__meta svg')).toHaveLength(1)
      // nothing is drawn over the Thumb: no icon in the leading slot, no badge element at all
      expect(item.querySelectorAll('.list-row__leading svg')).toHaveLength(0)
      expect(item.querySelector('[class*="badge"], [data-badge]')).toBeNull()
    }
  })

  it('the tick is filled once the Line is covered and hollow while some is still to get', () => {
    expect(tickOf(muttiTicked)).toBe(tickOf(loose))
    expect(tickOf(muttiToGet)).not.toBe(tickOf(muttiTicked))
  })

  it('the second line is muted: only the tick takes the success colour', () => {
    const { item } = setup(muttiToGet)
    expect(item.querySelector('.list-row__meta')).not.toHaveAttribute('data-status')
  })

  it('a monogram row (no Picture) has no badge either', () => {
    const { item } = setup(paperNoPrice)
    expect(item.querySelectorAll('.list-row__leading svg')).toHaveLength(0)
    expect(item.querySelectorAll('.list-row__meta svg')).toHaveLength(1)
  })

  it('a row that is not on the list has no tick', () => {
    const { item } = setup(notOnList)
    expect(item.querySelectorAll('.list-row__meta svg')).toHaveLength(0)
  })

  it('a waiting row has the clock, not the tick, and no badge', () => {
    const { item } = setup(waiting)
    expect(item.querySelectorAll('.list-row__meta svg')).toHaveLength(1)
    expect(item.querySelector('.scanned-row__tick')).toBeNull()
    expect(item.querySelectorAll('.list-row__leading svg')).toHaveLength(0)
  })
})

describe('ScannedRow: the active row', () => {
  it('shows no strip until it is active', () => {
    const { item } = setup(muttiTicked)
    expect(within(item).queryByRole('group', { name: 'Quantity of Mutti passata 700 g' })).toBeNull()
    expect(within(item).queryByRole('button', { name: 'Remove Mutti passata 700 g' })).toBeNull()
    expect(item.querySelector('.list-row__footer')).toBeNull()
    expect(item).not.toHaveAttribute('data-active')
  })

  it('keeps the top part of every row and adds one strip under it, in the same item: Stepper, Price, Remove; no ⋮ menu', () => {
    const { item } = setup(muttiTicked, { active: true })
    expect(item).toHaveAttribute('data-active', 'true')
    expect(item.querySelector('.list-row__title')).toHaveTextContent(/^Mutti passata$/)
    expect(item.querySelector('.list-row__meta')).toHaveTextContent(/^700 g·1400 of 1400 g$/)
    expect(item.querySelector('.list-row__value')).toHaveTextContent('$2.58×2 · $1.29')
    const strip = item.querySelector<HTMLElement>('.list-row__footer')!
    const stepper = within(strip).getByRole('group', { name: 'Quantity of Mutti passata 700 g' })
    expect(stepper).toHaveAttribute('data-size', 'xs')
    expect(within(stepper).getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '2')
    expect(within(strip).getByRole('button', { name: 'Price of Mutti passata 700 g…' })).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'Remove Mutti passata 700 g' })).toHaveTextContent(/^Remove$/)
    expect(within(item).queryByRole('button', { name: /^More for/ })).toBeNull()
    expect(item.querySelector('[aria-haspopup="menu"]')).toBeNull()
  })

  it('+ and − call the row handlers once each', async () => {
    const { props, item } = setup(muttiTicked, { active: true })
    await userEvent.click(within(item).getByRole('button', { name: 'Increase Quantity of Mutti passata 700 g' }))
    await userEvent.click(within(item).getByRole('button', { name: 'Decrease Quantity of Mutti passata 700 g' }))
    expect(props.onIncrement).toHaveBeenCalledTimes(1)
    expect(props.onDecrement).toHaveBeenCalledTimes(1)
  })

  it('− is still there at ×1 (it removes the row)', async () => {
    const { props, item } = setup(notOnList, { active: true })
    await userEvent.click(within(item).getByRole('button', { name: 'Decrease Quantity of Mutti passata 700 g' }))
    expect(props.onDecrement).toHaveBeenCalledTimes(1)
  })

  it('Remove calls onRemove once (the screen removes at once or asks)', async () => {
    const { props, item } = setup(muttiTicked, { active: true })
    await userEvent.click(within(item).getByRole('button', { name: 'Remove Mutti passata 700 g' }))
    expect(props.onRemove).toHaveBeenCalledTimes(1)
    expect(props.onActivate).not.toHaveBeenCalled()
  })

  it('a weighed row has the strip without the Stepper', () => {
    const { item } = setup(loose, { active: true })
    expect(within(item).queryByRole('group', { name: 'Quantity of Loose cheese' })).toBeNull()
    expect(within(item).getByRole('button', { name: 'Price of Loose cheese…' })).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Remove Loose cheese' })).toBeInTheDocument()
  })

  it('the row being priced is marked data-pricing (outlined)', () => {
    const { item } = setup(muttiTicked, { pricing: true })
    expect(item).toHaveAttribute('data-pricing', 'true')
  })
})

it('new strings exist with the spec copy', () => {
  expect(scanStrings.addPrice).toBe('Add price')
  expect(scanStrings.priceAction).toBe('Price')
  expect(scanStrings.removeProduct('Mutti passata')).toBe('Remove Mutti passata')
  expect(scanStrings.priceOf('Mutti passata')).toBe('Price of Mutti passata')
  expect(scanStrings.quantityOf('Mutti passata')).toBe('Quantity of Mutti passata')
})
