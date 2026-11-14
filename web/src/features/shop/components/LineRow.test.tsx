// DS-SHOP (docs/design/system.md §3): a Shop Line is a ListRow. [tick] [Thumb] [name over one-line meta] [quantity column].
// The whole row opens the line's sheet; there is no ⋮ column and no hint sentence on the row.
import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup } from '../../../ui/ListRow'
import { extraEntry, lineEntry } from '../lib/lines'
import { makeExtra, makeLine, makePast } from '../testData'
import { Icon } from '../../../ui/Icon'
import { LineRow } from './LineRow'

const none = () => {}
const passata = lineEntry(makeLine(), 'USD', 'metric')
const ticked = lineEntry(makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null }), 'USD', 'metric')
const hinted = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')

function row(entry = passata, group: 'open' | 'ticked' | 'not-needed' = 'open', over: Partial<ComponentProps<typeof LineRow>> = {}) {
  const props = { entry, group, onTick: none, onUntick: none, onOpen: none, ...over }
  return render(<ListGroup label="To get"><LineRow {...props} /></ListGroup>)
}

describe('LineRow: anatomy', () => {
  it('is a ListRow with the name, the pack as its one meta line, the quantity as value and the cost as sub-value', () => {
    const { container } = row()
    expect(container.querySelector('.list-row__title')).toHaveTextContent('Passata')
    expect(container.querySelector('.list-row__meta')).toHaveTextContent('2 × Mutti 700 g')
    expect(container.querySelector('.list-row__value')).toHaveTextContent('1400 g')
    expect(container.querySelector('.list-row__sub-value')).toHaveTextContent('$3.18')
  })

  it('order: tick control, then the Thumb, then the text, then the value', () => {
    const { container } = row()
    const parts = ['.list-row__control', '.list-row__leading', '.list-row__text', '.list-row__value'].map((s) => container.querySelector(s) as HTMLElement)
    parts.forEach((p) => expect(p).toBeInTheDocument())
    for (let i = 0; i < parts.length - 1; i++) expect(parts[i]!.compareDocumentPosition(parts[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the Thumb stands for the name: a Line without a Picture gets its monogram, never an empty box', () => {
    const { container } = row()
    expect(container.querySelector('.thumb')).toHaveAttribute('data-size', '40')
    expect(container.querySelector('.thumb')).toHaveAttribute('data-monogram', 'true')
    expect(container.querySelector('.thumb__monogram')).toHaveTextContent('P')
  })

  it('a Line with a Picture shows it', () => {
    const url = `/api/images/${'a'.repeat(32)}`
    const { container } = row(lineEntry(makeLine({ imageUrl: url }), 'USD', 'metric'))
    expect(container.querySelector('img')).toHaveAttribute('src', url)
    expect(container.querySelector('.thumb')).not.toHaveAttribute('data-monogram')
  })

  it('a free-text extra gets a monogram of its text too (every row keeps the same columns)', () => {
    const { container } = row(extraEntry(makeExtra(), 'metric'))
    expect(container.querySelector('.thumb__monogram')).toHaveTextContent('T')
    expect(container.querySelector('.list-row__value')).toBeNull()
  })

  it('shows no cost and no dash when there is no Price', () => {
    const { container } = row(lineEntry(makeLine({ estimatedCostCents: null }), 'USD', 'metric'))
    expect(container.querySelector('.list-row__sub-value')).toBeNull()
    expect(container).not.toHaveTextContent('—')
  })

  it('has no ⋮ Menu, no Delete button and no "Mark it" button on the row: those live in the sheet', () => {
    row(extraEntry(makeExtra(), 'metric'))
    row(hinted)
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
  })
})

describe('LineRow: the info marker', () => {
  it('a Line with unconfirmed past meals carries a small info marker in its meta line, not the sentence', () => {
    const { container } = row(hinted)
    const meta = container.querySelector('.list-row__meta')!
    expect(meta).toHaveAttribute('data-status', 'info')
    expect(meta).toHaveTextContent(/^Tue Dinner$/)
    expect(meta.querySelector('svg')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('not marked Cooked yet')
  })

  it('a row never grows a third line: the text column is the title and the meta', () => {
    const { container } = row(hinted)
    expect(container.querySelectorAll('.list-row__text > *')).toHaveLength(2)
  })
})

describe('LineRow: targets', () => {
  it('the whole row is one target named after the Line; tapping it opens the Line sheet with the entry and its group', async () => {
    const onOpen = vi.fn()
    row(passata, 'open', { onOpen })
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(passata, 'open')
  })

  it('the tick control ticks an open Line and does not open the sheet', async () => {
    const onTick = vi.fn()
    const onOpen = vi.fn()
    row(passata, 'open', { onTick, onOpen })
    const tick = screen.getByRole('button', { name: 'Tick Passata' })
    expect(tick).toHaveAttribute('aria-pressed', 'false')
    expect(tick.querySelector('svg')).toBeNull()
    await userEvent.click(tick)
    expect(onTick).toHaveBeenCalledExactlyOnceWith(passata)
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tick Passata' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a ticked Line is aria-pressed with the SAME label as when open (round 2: a state, not a renamed button), a plain check, and unticks from the control', async () => {
    const onUntick = vi.fn()
    const { container } = row(ticked, 'ticked', { onUntick })
    const tick = screen.getByRole('button', { name: 'Tick Passata' })
    expect(screen.queryByRole('button', { name: 'Untick Passata' })).toBeNull()
    expect(tick).toHaveAttribute('aria-pressed', 'true')
    expect(tick.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('.list-row')).toHaveAttribute('data-state', 'ticked')
    await userEvent.click(tick)
    expect(onUntick).toHaveBeenCalledExactlyOnceWith(ticked)
  })

  it('round 2: the ticked mark is a plain check (regular or bold weight), never the filled glyph: the filled circle is CSS', () => {
    row(ticked, 'ticked')
    const paths = (svg: Element) => [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|')
    const glyph = (weight: 'regular' | 'bold' | 'fill') => paths(render(<Icon name="tick" size={24} weight={weight} />).container.querySelector('svg')!)
    const drawn = paths(screen.getByRole('button', { name: 'Tick Passata' }).querySelector('svg')!)
    expect(drawn).not.toBe(glyph('fill'))
    expect([glyph('regular'), glyph('bold')]).toContain(drawn)
  })

  it('round 2: a ticked row keeps its quantity and cost, so the column still lines up (the stylesheet mutes them)', () => {
    const withPrice = lineEntry(makeLine({ ticked: true, quantity: 0, pack: null }), 'USD', 'metric')
    const { container } = row(withPrice, 'ticked')
    expect(container.querySelector('.list-row__value')).toHaveTextContent('1400 g')
    expect(container.querySelector('.list-row__sub-value')).toHaveTextContent('$3.18')
  })

  it('round 2: the row target announces that it opens a dialog (aria-haspopup="dialog")', () => {
    row()
    expect(screen.getByRole('button', { name: 'Passata' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getByRole('button', { name: 'Tick Passata' })).not.toHaveAttribute('aria-haspopup')
  })

  it('an open row is marked open; the tick control is at least a 44 px target (the stylesheet test pins the size)', () => {
    const { container } = row()
    expect(container.querySelector('.list-row')).toHaveAttribute('data-state', 'open')
    expect(container.querySelector('.list-row__control')).toContainElement(screen.getByRole('button', { name: 'Tick Passata' }))
    expect(screen.getByRole('button', { name: 'Tick Passata' })).toHaveClass('line-row__tick')
  })

  it('a Not needed Line has no tick control (it is neither open nor ticked); the row still opens its sheet', async () => {
    const onOpen = vi.fn()
    const { container } = row(passata, 'not-needed', { onOpen })
    expect(screen.queryByRole('button', { name: /^(Tick|Untick)/ })).toBeNull()
    expect(container.querySelector('.list-row')).toHaveAttribute('data-state', 'not-needed')
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(passata, 'not-needed')
  })

  it('inside a list, so the only buttons of a row are the row and its tick', () => {
    row()
    const list = screen.getByRole('list', { name: 'To get' })
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Tick Passata', 'Passata'])
  })
})
