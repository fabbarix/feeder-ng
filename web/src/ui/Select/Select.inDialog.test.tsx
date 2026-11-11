// XS regression: a Select (and a DateField) opened inside a BottomSheet/Dialog must float above it, not sit inside
// the dialog's overflow. The popover is a Popover-API element (popover="manual", top layer) placed with position: fixed.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddLotSheet } from '../../features/stock/components/AddLotSheet'
import { ExtraSheet } from '../../features/shop/components/ExtraSheet'
import { BottomSheet } from '../BottomSheet'
import { DateField } from '../fields/DateField'
import { Select } from './Select'

const rect = (top: number, left: number, width: number, height: number) =>
  ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

let shown: ReturnType<typeof vi.fn>
let hidden: ReturnType<typeof vi.fn>
beforeEach(() => {
  shown = vi.fn()
  hidden = vi.fn()
  Object.assign(HTMLElement.prototype, { showPopover: shown, hidePopover: hidden })
  vi.stubGlobal('innerHeight', 768)
  vi.stubGlobal('innerWidth', 1024)
})
afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).showPopover
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).hidePopover
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const fruit = [
  { value: 'apple', label: 'Apple' },
  { value: 'pear', label: 'Pear' },
]

function InSheet() {
  const [v, setV] = useState<string | null>(null)
  return (
    <BottomSheet open onClose={() => {}} title="Sheet">
      <Select label="Fruit" options={fruit} value={v} onChange={setV} />
    </BottomSheet>
  )
}

const popover = () => document.querySelector<HTMLElement>('.select__popover')!

describe('Select popover is a top-layer element', () => {
  it('is rendered with popover="manual" and shown with showPopover() when the list opens', async () => {
    render(<InSheet />)
    await userEvent.click(screen.getByRole('combobox', { name: /Fruit/ }))
    expect(popover()).toHaveAttribute('popover', 'manual')
    expect(shown).toHaveBeenCalled()
    expect(within(popover()).getByRole('listbox')).toBeInTheDocument()
    expect(within(popover()).getAllByRole('option')).toHaveLength(2)
  })

  it('still lists its options when the browser has no Popover API (fixed positioning alone)', async () => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).showPopover
    render(<InSheet />)
    await userEvent.click(screen.getByRole('combobox', { name: /Fruit/ }))
    expect(within(popover()).getAllByRole('option')).toHaveLength(2)
  })

  it('picking an option closes it and the dialog stays open', async () => {
    render(<InSheet />)
    await userEvent.click(screen.getByRole('combobox', { name: /Fruit/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Pear' }))
    expect(document.querySelector('.select__popover')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Sheet' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Fruit/ })).toHaveTextContent('Pear')
  })

  it('is placed from the trigger: fixed, 4 px below it, left edges aligned, never taller than the room', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('select__trigger')) return rect(100, 200, 320, 48)
      if (this.classList.contains('select__popover')) return rect(0, 0, 360, 300)
      return rect(0, 0, 0, 0)
    })
    render(<InSheet />)
    await userEvent.click(screen.getByRole('combobox', { name: /Fruit/ }))
    expect(popover().style.position).toBe('fixed')
    expect(popover().style.top).toBe('152px')
    expect(popover().style.left).toBe('200px')
    expect(popover().style.maxHeight).toBe('608px')
  })

  it('flips above a trigger near the bottom of the viewport', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('select__trigger')) return rect(600, 200, 320, 48)
      if (this.classList.contains('select__popover')) return rect(0, 0, 360, 300)
      return rect(0, 0, 0, 0)
    })
    render(<InSheet />)
    await userEvent.click(screen.getByRole('combobox', { name: /Fruit/ }))
    expect(popover().style.top).toBe('296px')
    expect(popover().style.maxHeight).toBe('588px')
  })

  it('hides the popover when the list closes (Escape) without closing the dialog', async () => {
    render(<InSheet />)
    await userEvent.click(screen.getByRole('combobox', { name: /Fruit/ }))
    await userEvent.keyboard('{Escape}')
    expect(hidden).toHaveBeenCalled()
    expect(document.querySelector('.select__popover')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Sheet' })).toBeInTheDocument()
  })
})

describe('every Select in a sheet or dialog uses the floating popover', () => {
  it('ExtraSheet: the Ingredient select', async () => {
    render(<ExtraSheet open onClose={() => {}} ingredients={[{ id: 1, name: 'milk', baseUnit: 'ml' }]} onSubmit={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
    expect(popover()).toHaveAttribute('popover', 'manual')
    expect(within(popover()).getByRole('option', { name: /milk/ })).toBeInTheDocument()
  })

  it('AddLotSheet: the Ingredient select and the Storage Place select', async () => {
    render(
      <AddLotSheet
        open
        onClose={() => {}}
        onSubmit={() => {}}
        choices={[{ id: 1, name: 'milk', baseUnit: 'ml' }]}
        places={[{ id: 7, name: 'Fridge', kind: 'fridge', default: false }]}
      />,
    )
    for (const name of [/Ingredient/, /Storage Place/]) {
      await userEvent.click(screen.getByRole('combobox', { name }))
      expect(popover()).toHaveAttribute('popover', 'manual')
      await userEvent.keyboard('{Escape}')
    }
  })

  it('DateField inside a sheet: the calendar is a popover="manual" element', async () => {
    render(
      <BottomSheet open onClose={() => {}} title="Sheet">
        <DateField label="Bought on" value="" onChange={() => {}} today="2026-11-10" locale="en-GB" />
      </BottomSheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Bought on/ }))
    const calendar = document.querySelector<HTMLElement>('.date-field__popover')!
    expect(calendar).toHaveAttribute('popover', 'manual')
    expect(shown).toHaveBeenCalled()
  })
})
