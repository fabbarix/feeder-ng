// R2-4 L-07 (second half): "Throw out or keep?" rows are ListRows. From 820 px the two actions trail the row; below it they sit under the text.
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import { SpoiledTile } from './SpoiledTile'

const original = globalThis.matchMedia
function viewport(px: number) {
  globalThis.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query)
    return { matches: m ? px >= Number(m[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
  }) as unknown as typeof globalThis.matchMedia
}
afterEach(() => {
  globalThis.matchMedia = original
})

const lots = [makeLot({ id: 1 }), makeLot({ id: 2, ingredientName: 'milk', quantity: 1000, baseUnit: 'ml', goesOff: '2026-11-08' })]
const view = () => render(<SpoiledTile today="2026-11-09" lots={lots} onThrowOut={() => {}} onKeep={() => {}} />)

describe('SpoiledTile rows are ListRows', () => {
  it('has one ListRow per lot in a list, with the name as title and amount and wording as meta', () => {
    viewport(1280)
    view()
    const rows = document.querySelectorAll('li.list-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getByText('Chicken thighs')).toHaveClass('list-row__title')
    expect(rows[0].querySelector('.list-row__meta')).toHaveTextContent('200 g · Went off 4 days ago')
    expect(document.querySelector('.spoiled-tile__row')).toBeNull()
  })

  it('from 820 px both actions trail the row, Throw out before Keep', () => {
    viewport(820)
    view()
    const row = document.querySelectorAll('li.list-row')[0]
    const trailing = row.querySelector('.list-row__trailing') as HTMLElement
    expect(trailing).not.toBeNull()
    const buttons = within(trailing).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Throw out chicken thighs', 'Keep chicken thighs'])
    expect(row.querySelector('.list-row__extra')).toBeNull()
  })

  it('below 820 px the actions sit under the text (the row grows) and the trailing slot is empty', () => {
    viewport(600)
    view()
    const row = document.querySelectorAll('li.list-row')[0] as HTMLElement
    expect(row).toHaveAttribute('data-height', 'auto')
    expect(row.querySelector('.list-row__trailing')).toBeNull()
    const extra = row.querySelector('.list-row__extra') as HTMLElement
    expect(within(extra).getAllByRole('button')).toHaveLength(2)
  })

  it('a row is not a tap target: only the two buttons are interactive', () => {
    viewport(1280)
    view()
    expect(document.querySelectorAll('.list-row__target')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})
