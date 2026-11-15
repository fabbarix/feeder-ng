// R2-4 L-07 (second half): "Throw out or keep?" rows are ListRows. B9-09: one DOM at every width; the container query in stock.css decides where the actions sit.
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
    expect(within(rows[0]! as HTMLElement).getByText('Chicken thighs')).toHaveClass('list-row__title')
    expect(rows[0]!.querySelector('.list-row__meta')).toHaveTextContent('Went off 3 days ago · 200 g')
    expect(document.querySelector('.spoiled-tile__row')).toBeNull()
  })

  // B9-09 (DS-09): the tile no longer reads the viewport. Its rows are the same at every width (the actions in the row's own slot below the
  // text); from 44 rem of the tile's own width a container query in stock.css (@container spoiled-tile) places them beside the text.
  it('at every viewport both actions are in the row\'s extra slot, Throw out before Keep, and the trailing slot is empty', () => {
    for (const px of [375, 600, 820, 1280]) {
      viewport(px)
      const { unmount } = view()
      const row = document.querySelectorAll('li.list-row')[0] as HTMLElement
      expect(row.querySelector('.list-row__trailing')).toBeNull()
      const extra = row.querySelector('.list-row__extra') as HTMLElement
      expect(within(extra).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Throw out chicken thighs', 'Keep chicken thighs'])
      unmount()
    }
  })

  it('a row is not a tap target: only the two buttons are interactive', () => {
    viewport(1280)
    view()
    expect(document.querySelectorAll('.list-row__target')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})
