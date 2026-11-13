// SR4: ScannedList is the list of ScannedRows (newest first, as the session gives them), its empty state and a footer slot
// for RR4's "Read the receipt" row. It holds which row is active (one at a time); the screen holds the rest.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildScannedRows, displayOrder, type SessionEntry } from '../lib/scannedList'
import { applied, cheese, passata, products, toiletPaper } from '../lib/scannedList.testData'
import { ScannedList, type ScannedListProps } from './ScannedList'

const rowsOf = (entries: SessionEntry[]) => displayOrder(buildScannedRows(entries, products))
const base: SessionEntry[] = [
  applied('u-1', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true }),
  applied('u-2', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true }),
  applied('u-3', toiletPaper),
]

function props(over: Partial<ScannedListProps> = {}): ScannedListProps {
  return {
    rows: rowsOf(base),
    currency: 'USD',
    system: 'metric',
    pricingKey: null,
    onPrice: vi.fn(),
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  }
}
const view = (p: ScannedListProps) =>
  render(
    <MemoryRouter>
      <ScannedList {...p} />
    </MemoryRouter>,
  )
const items = () => within(screen.getByRole('list', { name: 'Scanned list' })).getAllByRole('listitem')

describe('ScannedList', () => {
  it('is a list named "Scanned list" with one item per row, in the order given (newest first)', () => {
    view(props())
    expect(items().map((li) => within(li).getByRole('button', { name: /^(Mutti|Regina)/ }).getAttribute('aria-label'))).toEqual(['Regina toilet paper 9 pieces', 'Mutti passata 700 g'])
  })

  it('shows the empty state "Nothing scanned yet" with its hint, and no list', () => {
    view(props({ rows: [] }))
    expect(screen.getByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument()
    expect(screen.getByText('Point the camera at a barcode. Lines to get are under To get.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Scanned list' })).toBeNull()
  })

  it('renders the footer slot after the rows, whatever it holds', () => {
    view(props({ footer: <button type="button">Read the receipt</button> }))
    const footer = screen.getByRole('button', { name: 'Read the receipt' })
    const list = screen.getByRole('list', { name: 'Scanned list' })
    expect(list.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list).not.toContainElement(footer)
  })

  it('renders nothing extra without a footer', () => {
    view(props())
    expect(screen.queryByText('Read the receipt')).toBeNull()
  })

  it('tapping a row makes it active: its strip shows; tapping another moves it; tapping it again clears it', async () => {
    view(props())
    const [paper, mutti] = items()
    await userEvent.click(within(mutti!).getByRole('button', { name: 'Mutti passata 700 g' }))
    expect(within(mutti!).getByRole('group', { name: 'Quantity of Mutti passata 700 g' })).toBeInTheDocument()
    await userEvent.click(within(paper!).getByRole('button', { name: 'Regina toilet paper 9 pieces' }))
    expect(within(mutti!).queryByRole('group')).toBeNull()
    expect(within(paper!).getByRole('group', { name: 'Quantity of Regina toilet paper 9 pieces' })).toBeInTheDocument()
    await userEvent.click(within(paper!).getByRole('button', { name: 'Regina toilet paper 9 pieces' }))
    expect(screen.queryByRole('group', { name: /^Quantity of/ })).toBeNull()
  })

  it('the row handlers get the row key', async () => {
    const p = props()
    view(p)
    const mutti = items()[1]!
    await userEvent.click(within(mutti).getByRole('button', { name: 'Mutti passata 700 g' }))
    await userEvent.click(within(mutti).getByRole('button', { name: 'Increase Quantity of Mutti passata 700 g' }))
    await userEvent.click(within(mutti).getByRole('button', { name: 'Decrease Quantity of Mutti passata 700 g' }))
    await userEvent.click(within(mutti).getByRole('button', { name: /^Price of Mutti/ }))
    await userEvent.click(within(mutti).getByRole('button', { name: 'Remove Mutti passata 700 g' }))
    expect(p.onIncrement).toHaveBeenCalledWith('7')
    expect(p.onDecrement).toHaveBeenCalledWith('7')
    expect(p.onPrice).toHaveBeenCalledWith('7')
    expect(p.onRemove).toHaveBeenCalledWith('7')
    await userEvent.click(within(items()[0]!).getByRole('button', { name: /^Add price/ }))
    expect(p.onPrice).toHaveBeenLastCalledWith('31')
  })

  it('marks the row being priced (outlined) and no other', () => {
    view(props({ pricingKey: '7' }))
    const [paper, mutti] = items()
    expect(mutti).toHaveAttribute('data-pricing', 'true')
    expect(paper).not.toHaveAttribute('data-pricing')
  })

  it('a new Product scanned on top clears the active row; a + on the active row (it moves up) does not', async () => {
    const view1 = view(props())
    await userEvent.click(within(items()[1]!).getByRole('button', { name: 'Mutti passata 700 g' }))
    expect(screen.getByRole('group', { name: /^Quantity of Mutti/ })).toBeInTheDocument()
    // + on Mutti: a new scan of the same Product moves it to the top; it stays active
    const more = [...base, applied('u-5', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true })]
    view1.rerender(
      <MemoryRouter>
        <ScannedList {...props({ rows: rowsOf(more) })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('group', { name: /^Quantity of Mutti/ })).toBeInTheDocument()
    // a different Product scanned: the active row is cleared
    const other = [...more, applied('u-6', cheese, { quantity: 312, weighed: true, priceCents: 624, pricePerKgCents: 2000 })]
    view1.rerender(
      <MemoryRouter>
        <ScannedList {...props({ rows: rowsOf(other) })} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('group', { name: /^Quantity of/ })).toBeNull()
  })

  it('washes only the row a scan just put on top (SR4 review)', () => {
    view(props({ justScanned: { key: '31', pulse: 'b' } }))
    const [paper, mutti] = items()
    expect(paper).toHaveAttribute('data-fresh', 'b')
    expect(mutti).not.toHaveAttribute('data-fresh')
  })

  it('every row button has an accessible name and the list has no unnamed button', () => {
    view(props({ pricingKey: '7' }))
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('aria-label') ?? b.textContent?.trim()).toBeTruthy()
  })
})
