// SR4: ScannedRow is a ListRow of the Scanned list (shop-scan-proposals.md 13.3). It renders a SR3 row model: the Thumb
// (or monogram), the name without the pack size, rowMeta (size · tick x of y), rowAmounts, "Add price", and for the active row the Stepper and the ⋮ menu.
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

  it('a priced row opens the Price entry from its Price button, named "Price of <product>"', async () => {
    const { props, item } = setup(muttiTicked)
    const price = within(item).getByRole('button', { name: /^Price of Mutti passata 700 g/ })
    expect(price).toHaveTextContent('$2.58')
    await userEvent.click(price)
    expect(props.onPrice).toHaveBeenCalledTimes(1)
    expect(props.onActivate).not.toHaveBeenCalled()
  })

  it('a row with no Price has no "Price of" button, and a priced row has no "Add price"', () => {
    expect(within(setup(paperNoPrice).item).queryByRole('button', { name: /^Price of/ })).toBeNull()
    document.body.innerHTML = ''
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
  it('shows no Stepper or menu until it is active', () => {
    const { item } = setup(muttiTicked)
    expect(within(item).queryByRole('group', { name: 'Quantity of Mutti passata 700 g' })).toBeNull()
    expect(within(item).queryByRole('button', { name: 'More for Mutti passata 700 g' })).toBeNull()
    expect(item).not.toHaveAttribute('data-active')
  })

  it('shows the Stepper (− ×N +) in the value column and the ⋮ "More for <product>" menu', () => {
    const { item } = setup(muttiTicked, { active: true })
    expect(item).toHaveAttribute('data-active', 'true')
    const stepper = within(item).getByRole('group', { name: 'Quantity of Mutti passata 700 g' })
    expect(within(stepper).getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '2')
    expect(within(item).getByRole('button', { name: 'More for Mutti passata 700 g' })).toHaveAttribute('aria-haspopup', 'menu')
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

  it('the menu offers Remove, and Open the Product only when the screen can open it', async () => {
    const { props } = setup(muttiTicked, { active: true })
    await userEvent.click(screen.getByRole('button', { name: 'More for Mutti passata 700 g' }))
    expect(screen.queryByRole('menuitem', { name: 'Open the Product' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(props.onRemove).toHaveBeenCalledTimes(1)
  })

  it('Open the Product is in the menu when onOpenProduct is given', async () => {
    const onOpenProduct = vi.fn()
    setup(muttiTicked, { active: true, onOpenProduct })
    await userEvent.click(screen.getByRole('button', { name: 'More for Mutti passata 700 g' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open the Product' }))
    expect(onOpenProduct).toHaveBeenCalledTimes(1)
  })

  it('a weighed row has no Stepper (+ adds packs), only the menu', () => {
    const { item } = setup(loose, { active: true })
    expect(within(item).queryByRole('group', { name: 'Quantity of Loose cheese' })).toBeNull()
    expect(within(item).getByRole('button', { name: 'More for Loose cheese' })).toBeInTheDocument()
  })

  it('the row being priced is marked data-pricing (outlined)', () => {
    const { item } = setup(muttiTicked, { pricing: true })
    expect(item).toHaveAttribute('data-pricing', 'true')
  })
})

it('new strings exist with the spec copy', () => {
  expect(scanStrings.addPrice).toBe('Add price')
  expect(scanStrings.moreFor('Mutti passata')).toBe('More for Mutti passata')
  expect(scanStrings.openProduct).toBe('Open the Product')
  expect(scanStrings.priceOf('Mutti passata')).toBe('Price of Mutti passata')
  expect(scanStrings.quantityOf('Mutti passata')).toBe('Quantity of Mutti passata')
})
