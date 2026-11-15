// B9-29 (SSP-10, mock ssp-10-put-away.html): "Put away 17 Stock Lots". Props pinned here:
//   <PutAwaySheet open onClose lots places today system? onMove onAllPutAway? />
//   lots          the Not sorted Stock Lots (the screen passes them; the sheet lists them)
//   onMove(moves) one request for every ticked Lot: Promise<{ lots: StockLot[]; skipped: number[] }> (usePutAway().putAway)
//   onAllPutAway  called once, after the sheet closed itself, when the last Lot has left the list (the screen toasts "Every Stock Lot is put away")
// What the tests pin:
//   - a dialog named "Put away N Stock Lots"; a Select "Put into" of the Storage Places, preset by defaultPutAwayPlace; the hint
//     "Tick what goes there. Feeder remembers it for next time."; one checkbox row per Lot named after the Ingredient, with the quantity
//     in the value column and the status alone as meta (SSP-05)
//   - the primary is named "Move N to <place>" (count and place), and never disabled: with nothing ticked it reads "Move to <place>" and
//     says "Tick at least one Stock Lot." as a field-level line (not an alert), and sends nothing (design choice, see the hand-back)
//   - a move sends the ticked Lots in list order in ONE call; moved and skipped Lots leave the list, the ticks clear, the Select stays on
//     the chosen place, focus goes to the first remaining row, the result is announced politely (role=status): "2 Stock Lots moved to
//     Kitchen Fridge"
//   - the last Lot leaving closes the sheet and calls onAllPutAway; Close keeps what was moved (onClose only)
//   - a refused move shows <FormError> (the one alert), keeps the ticks and the list
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickOption } from '../../settings/test-utils'
import { makeLot, makeSupplyLot } from '../testData'
import type { StoragePlace } from '../types'
import { PutAwaySheet } from './PutAwaySheet'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: false },
  { id: 3, name: 'Kitchen Fridge', kind: 'fridge', default: false },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]
const lots = [
  makeLot({ id: 21, ingredientName: 'cauliflower', quantity: 1200, goesOff: '2026-11-13', spoiled: false, useSoon: false }),
  makeLot({ id: 22, ingredientName: 'feta', quantity: 300, goesOff: '2026-11-13', spoiled: false, useSoon: false }),
  makeLot({ id: 23, ingredientName: 'chicken', quantity: 650, goesOff: null, spoiled: false, useSoon: false }),
]

function setup(over: Partial<React.ComponentProps<typeof PutAwaySheet>> = {}) {
  const onMove = vi.fn().mockImplementation(async (moves: { lotId: number }[]) => ({ lots: moves.map((m) => makeLot({ id: m.lotId, storagePlaceId: 3 })), skipped: [] }))
  const onClose = vi.fn()
  const onAllPutAway = vi.fn()
  render(<PutAwaySheet open onClose={onClose} lots={lots} places={places} today="2026-11-09" onMove={onMove} onAllPutAway={onAllPutAway} {...over} />)
  return { onMove, onClose, onAllPutAway }
}
const sheet = () => screen.getByRole('dialog', { name: /^Put away/ })
const tick = (name: string) => userEvent.click(within(sheet()).getByRole('checkbox', { name }))

beforeEach(() => vi.clearAllMocks())

describe('PutAwaySheet', () => {
  it('is named for the count, presets "Put into" to the first fridge, and gives the hint', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Put away 3 Stock Lots' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('combobox', { name: 'Put into' })).toHaveTextContent('Kitchen Fridge')
    expect(within(sheet()).getByText('Tick what goes there. Feeder remembers it for next time.')).toBeInTheDocument()
  })
  it('lists a checkbox row per Lot, unticked, the quantity in the value column and the status alone as meta', () => {
    setup()
    const boxes = within(sheet()).getAllByRole('checkbox')
    expect(boxes.map((b) => b.getAttribute('aria-label') ?? b.closest('li')?.querySelector('.list-row__title')?.textContent)).toEqual(['Cauliflower', 'Feta', 'Chicken'])
    for (const b of boxes) expect(b).not.toBeChecked()
    const feta = within(sheet()).getByRole('checkbox', { name: 'Feta' }).closest('li')!
    expect(feta.querySelector('.list-row__value')).toHaveTextContent('300 g')
    expect(feta.querySelector('.list-row__meta')).toHaveTextContent(/^Good until Fri$/)
    expect(within(sheet()).getByRole('checkbox', { name: 'Chicken' }).closest('li')!.querySelector('.list-row__meta')).toHaveTextContent(/^No go-off date$/)
  })
  it('the primary names the count and the place, and follows both', async () => {
    setup()
    expect(within(sheet()).getByRole('button', { name: 'Move to Kitchen Fridge' })).toBeEnabled()
    await tick('Cauliflower')
    await tick('Feta')
    expect(within(sheet()).getByRole('button', { name: 'Move 2 to Kitchen Fridge' })).toBeInTheDocument()
    await pickOption('Put into', /Garage Freezer/, within(sheet()))
    expect(within(sheet()).getByRole('button', { name: 'Move 2 to Garage Freezer' })).toBeInTheDocument()
  })
  it('with nothing ticked, Move says what to do at the field and sends nothing', async () => {
    const { onMove } = setup()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Move to Kitchen Fridge' }))
    expect(onMove).not.toHaveBeenCalled()
    expect(within(sheet()).getByText('Tick at least one Stock Lot.')).toBeInTheDocument()
    expect(within(sheet()).queryByRole('alert')).toBeNull()
  })
  it('moves the ticked Lots in one call, in list order, to the chosen place', async () => {
    const { onMove } = setup()
    await tick('Feta')
    await tick('Cauliflower')
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Move 2 to Kitchen Fridge' }))
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith([
      { lotId: 21, storagePlaceId: 3 },
      { lotId: 22, storagePlaceId: 3 },
    ])
  })
  it('after a move the Lots leave the list, the ticks clear, the Select stays, focus goes to the first remaining row, and it is announced', async () => {
    setup()
    await tick('Cauliflower')
    await tick('Feta')
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Move 2 to Kitchen Fridge' }))
    await waitFor(() => expect(within(sheet()).queryByRole('checkbox', { name: 'Feta' })).toBeNull())
    expect(within(sheet()).queryByRole('checkbox', { name: 'Cauliflower' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Put away 1 Stock Lot' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('checkbox', { name: 'Chicken' })).not.toBeChecked()
    expect(within(sheet()).getByRole('combobox', { name: 'Put into' })).toHaveTextContent('Kitchen Fridge')
    await waitFor(() => expect(within(sheet()).getByRole('checkbox', { name: 'Chicken' })).toHaveFocus())
    expect(within(sheet()).getByRole('status')).toHaveTextContent('2 Stock Lots moved to Kitchen Fridge')
  })
  it('a Lot sorted meanwhile (skipped) leaves the list too, and is not counted as moved', async () => {
    const { onMove } = setup()
    onMove.mockResolvedValueOnce({ lots: [makeLot({ id: 21, storagePlaceId: 3 })], skipped: [22] })
    await tick('Cauliflower')
    await tick('Feta')
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Move 2 to Kitchen Fridge' }))
    await waitFor(() => expect(within(sheet()).queryByRole('checkbox', { name: 'Feta' })).toBeNull())
    expect(within(sheet()).getByRole('status')).toHaveTextContent('1 Stock Lot moved to Kitchen Fridge')
  })
  it('the last Lot leaving closes the sheet and says so once', async () => {
    const { onClose, onAllPutAway } = setup()
    for (const n of ['Cauliflower', 'Feta', 'Chicken']) await tick(n)
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Move 3 to Kitchen Fridge' }))
    await waitFor(() => expect(onAllPutAway).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalled()
  })
  it('Close keeps what was moved: it only closes', async () => {
    const { onMove, onClose, onAllPutAway } = setup()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onMove).not.toHaveBeenCalled()
    expect(onAllPutAway).not.toHaveBeenCalled()
  })
  it('a refused move shows the one alert, keeps the list and the ticks', async () => {
    const { onMove } = setup()
    onMove.mockRejectedValueOnce(new Error('That Storage Place is gone.'))
    await tick('Feta')
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Move 1 to Kitchen Fridge' }))
    expect(await within(sheet()).findByRole('alert')).toHaveTextContent('That Storage Place is gone.')
    expect(within(sheet()).getByRole('checkbox', { name: 'Feta' })).toBeChecked()
    expect(within(sheet()).getAllByRole('checkbox')).toHaveLength(3)
  })
  it('uses no native select or checkbox', () => {
    setup()
    expect(sheet().querySelector('select, option, input[type="checkbox"]:not([class])')).toBeNull()
  })
  it('a Supply row carries its Restock meta, as on the Pantry row', () => {
    const supply = makeSupplyLot({ id: 41, ingredientName: 'dish soap', quantity: 2, baseUnit: 'piece', storagePlaceId: null })
    setup({ lots: [supply], restockFor: () => ({ level: 6, stock: 4 }) })
    const row = within(sheet()).getByRole('checkbox', { name: 'Dish soap' }).closest('.list-row')
    expect(row).toHaveTextContent('Below 6 · 4 in Stock')
  })
})
