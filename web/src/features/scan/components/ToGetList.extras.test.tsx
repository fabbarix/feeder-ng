// B9-41 (SSP-11): a manual extra is a To get row. A free-text extra's second line is "Added by hand" with the registered `extra` icon (NotePencil);
// an Ingredient extra reads like a Line ("0 of 500 g", the quantity in the value column); each row's name is "Tick {text}", as the Lines are.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from '../../../ui/Icon'
import { extraEntry } from '../../shop/lib/lines'
import { makeExtra } from '../../shop/testData'
import type { ToGetRow } from '../lib/toGet'
import { ToGetList } from './ToGetList'

const long = 'Extra virgin olive oil, cold pressed, from the farm shop near the station'
const free: ToGetRow = { entry: extraEntry(makeExtra({ id: 1, text: long }), 'metric'), cover: { text: '', done: false }, byHand: true }
const oil: ToGetRow = { entry: extraEntry(makeExtra({ id: 2, text: null, ingredientId: 9, name: 'olive oil', baseUnit: 'g', quantity: 500 }), 'metric'), cover: { text: '0 of 500 g', done: false } }

function setup(rows: ToGetRow[], onTick = vi.fn()) {
  render(
    <MemoryRouter>
      <ToGetList rows={rows} pendingKeys={new Set()} onTick={onTick} />
    </MemoryRouter>,
  )
  return { onTick, list: screen.getByRole('list', { name: 'To get' }) }
}

describe('ToGetList: manual extras', () => {
  it('a free-text extra: the whole row is the tick named "Tick {text}", its second line is "Added by hand" after the extra icon', () => {
    const { list } = setup([free])
    const row = within(list).getByRole('button', { name: `Tick ${long}` }).closest('li')!
    const meta = row.querySelector('.list-row__meta')!
    expect(meta).toHaveTextContent('Added by hand')
    const { container } = render(<Icon name="extra" size={14} />)
    expect(meta.querySelector('svg')!.innerHTML).toBe(container.querySelector('svg')!.innerHTML)
    expect(meta).not.toHaveTextContent(/ of /)
    expect(row.querySelector('.list-row__value')).toBeNull()
  })

  it('an Ingredient extra reads like a Line: the hollow "0 of 500 g" and its quantity as the value', () => {
    const { list } = setup([oil])
    const row = within(list).getByRole('button', { name: 'Tick Olive oil' }).closest('li')!
    expect(row.querySelector('.list-row__meta')).toHaveTextContent('0 of 500 g')
    expect(row).toHaveTextContent('500 g')
    expect(row.querySelector('.list-row__meta')).not.toHaveTextContent('Added by hand')
  })

  it('a tap hands the extra\'s entry to onTick, once', async () => {
    const { list, onTick } = setup([free, oil])
    await userEvent.click(within(list).getByRole('button', { name: `Tick ${long}` }))
    expect(onTick).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: 'extra:1', kind: 'extra', extraId: 1 }))
  })

  it('the long title may take its lines and the row still has one target', () => {
    const { list } = setup([free])
    expect(within(list).getAllByRole('button')).toHaveLength(1)
  })
})
