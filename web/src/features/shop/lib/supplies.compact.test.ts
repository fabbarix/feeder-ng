import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../testData'
import { listEntries } from './lines'
import { rowMeta } from './rows'
import { restockText } from './supplies'

// b8-polish (docs/dev/design/b8-polish.md 2): a narrow Shop row reads "400 ml/1 l"; the full text stays for everything else.
const ml = makeLine({ ingredientId: 20, name: 'Washing-up liquid', baseUnit: 'ml', kind: 'supply', restock: { level: 1000, stock: 400 }, need: 1000, available: 400, quantity: 600, pack: null, estimatedCostCents: null })

describe('restockText: the compact option', () => {
  it('the default is the full "400 ml of 1 l"', () => {
    expect(restockText({ level: 1000, stock: 400 }, 'ml', 'metric')).toBe('400 ml of 1 l')
  })
  it('compact: true is "400 ml/1 l"', () => {
    expect(restockText({ level: 1000, stock: 400 }, 'ml', 'metric', { compact: true })).toBe('400 ml/1 l')
    expect(restockText({ level: 6, stock: 2 }, 'piece', 'metric', { compact: true })).toBe('2/6')
  })
})

describe('a Supply entry carries both texts', () => {
  const entry = () => listEntries(makeList({ lines: [ml] }), 'metric').open[0]!
  it('restockText stays full, restockCompact is the short form', () => {
    expect(entry().restockText).toBe('400 ml of 1 l')
    expect(entry().restockCompact).toBe('400 ml/1 l')
  })
  it('a food Line and a ticked Supply have neither', () => {
    const food = listEntries(makeList({ lines: [makeLine({ kind: 'food', restock: null })] }), 'metric').open[0]!
    expect(food.restockCompact).toBe('')
    const ticked = listEntries(makeList({ lines: [{ ...ml, ticked: true }] }), 'metric').ticked[0]!
    expect(ticked.restockCompact).toBe('')
  })
})

describe('rowMeta(entry, { compact })', () => {
  const entry = () => listEntries(makeList({ lines: [ml] }), 'metric').open[0]!
  it('the full reason by default, the short one when compact; the tone stays info', () => {
    expect(rowMeta(entry())).toEqual({ text: '400 ml of 1 l', status: 'info' })
    expect(rowMeta(entry(), { compact: true })).toEqual({ text: '400 ml/1 l', status: 'info', fullText: '400 ml of 1 l' })
  })
  it('compact leaves the other metas alone (no fullText)', () => {
    const e = { ...entry(), restockText: '', restockCompact: '', hintShort: 'Fri Dinner +2' }
    expect(rowMeta(e, { compact: true })).toEqual({ text: 'Fri Dinner +2', status: 'info' })
  })
})
