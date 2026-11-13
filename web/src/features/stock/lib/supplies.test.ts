// Supplies in the Pantry (household-items.md 4.2, 4.7, 6; H6): the row meta, the Restock level, and what "Used up" sends.
// Plain TypeScript, no React.
import { describe, expect, it } from 'vitest'
import { makeLot, makeSupplyLot, makeSupplyTotal } from '../testData'
import {
  checkUsedUp,
  householdHasSupply,
  isBelowRestock,
  isSupply,
  restockLevelsOf,
  restockOf,
  restockPhrase,
  supplyLotLineMeta,
  supplyLotMeta,
  supplyRowMeta,
  supplyStockOf,
  usedUpRequest,
} from './supplies'

describe('isSupply', () => {
  it('is true for kind "supply" only; absent (an older fixture) is food', () => {
    expect(isSupply(makeSupplyLot())).toBe(true)
    expect(isSupply(makeSupplyTotal())).toBe(true)
    expect(isSupply(makeLot({ kind: 'food' }))).toBe(false)
    expect(isSupply(makeLot())).toBe(false)
  })
})

const choices = [
  { id: 7, name: 'rice', baseUnit: 'g' as const, kind: 'food' as const, restockLevel: null },
  { id: 40, name: 'toilet paper', baseUnit: 'piece' as const, kind: 'supply' as const, restockLevel: 6 },
  { id: 41, name: 'dish soap', baseUnit: 'ml' as const, kind: 'supply' as const, restockLevel: null },
]

describe('the Restock level of a Supply', () => {
  it('restockLevelsOf maps a Supply with a level, and nothing else', () => {
    expect([...restockLevelsOf(choices)]).toEqual([[40, 6]])
  })
  it('a food Ingredient with a stray level is ignored (a level is for Supplies only, D3)', () => {
    expect(restockLevelsOf([{ ...choices[0]!, restockLevel: 3 }]).size).toBe(0)
  })
  it('supplyStockOf sums the Lots of each Supply, in every Storage Place, and skips food', () => {
    const lots = [makeSupplyLot({ id: 1, quantity: 4, storagePlaceId: 1 }), makeSupplyLot({ id: 2, quantity: 3, storagePlaceId: 2 }), makeLot({ id: 3, ingredientId: 7, quantity: 900 })]
    expect([...supplyStockOf(lots)]).toEqual([[40, 7]])
  })
  it('restockOf is {level, stock}, the shape of a Shopping List Line; null without a level or for food', () => {
    const levels = restockLevelsOf(choices)
    const stock = new Map([[40, 4]])
    expect(restockOf(40, levels, stock)).toEqual({ level: 6, stock: 4 })
    expect(restockOf(40, levels, new Map())).toEqual({ level: 6, stock: 0 })
    expect(restockOf(41, levels, stock)).toBeNull()
    expect(restockOf(7, levels, stock)).toBeNull()
  })
  it('is below the level only when Stock is less than it (at the level is not below)', () => {
    expect(isBelowRestock({ level: 6, stock: 5 })).toBe(true)
    expect(isBelowRestock({ level: 6, stock: 6 })).toBe(false)
    expect(isBelowRestock({ level: 6, stock: 9 })).toBe(false)
    expect(isBelowRestock(null)).toBe(false)
  })
})

describe('householdHasSupply', () => {
  it('is true while the catalogue or the Stock holds a Supply', () => {
    expect(householdHasSupply([], choices)).toBe(true)
    expect(householdHasSupply([makeSupplyLot()], [])).toBe(true)
  })
  it('is false for food only', () => {
    expect(householdHasSupply([makeLot()], [choices[0]!])).toBe(false)
    expect(householdHasSupply([], [])).toBe(false)
  })
})

describe('restockPhrase', () => {
  it('"restocks below 6" for a piece Supply (the unit is the row\'s own, so the number stands alone)', () => {
    expect(restockPhrase({ level: 6, stock: 9 }, 'piece', 'metric')).toBe('restocks below 6')
    expect(restockPhrase({ level: 6, stock: 6 }, 'piece', 'metric')).toBe('restocks below 6')
  })
  it('names the unit for ml and g', () => {
    expect(restockPhrase({ level: 1000, stock: 1500 }, 'ml', 'metric')).toBe('restocks below 1000 ml')
    expect(restockPhrase({ level: 500, stock: 600 }, 'g', 'metric')).toBe('restocks below 500 g')
  })
  it('says so when Stock is below the level', () => {
    expect(restockPhrase({ level: 6, stock: 2 }, 'piece', 'metric')).toBe('below Restock level 6')
    expect(restockPhrase({ level: 1000, stock: 200 }, 'ml', 'metric')).toBe('below Restock level 1000 ml')
  })
  it('is empty without a level', () => {
    expect(restockPhrase(null, 'piece', 'metric')).toBe('')
  })
})

describe('supplyLotMeta: the meta of a Supply Lot row', () => {
  it('the quantity and the restock phrase; never Good until, "No go-off date", Use soon or Spoiled', () => {
    const lot = makeSupplyLot({ quantity: 4 })
    expect(supplyLotMeta(lot, { level: 6, stock: 9 }, 'metric')).toBe('4 pieces · restocks below 6')
    expect(supplyLotMeta(lot, { level: 6, stock: 2 }, 'metric')).toBe('4 pieces · below Restock level 6')
  })
  it('just the quantity without a level', () => {
    expect(supplyLotMeta(makeSupplyLot({ quantity: 1 }), null, 'metric')).toBe('1 piece')
    expect(supplyLotMeta(makeSupplyLot({ baseUnit: 'ml', quantity: 500 }), null, 'metric')).toBe('500 ml')
  })
})

describe('supplyRowMeta: the meta of a Supply in By Ingredient', () => {
  it('the Lot count and the restock phrase; no go-off phrase', () => {
    expect(supplyRowMeta(makeSupplyTotal({ lotCount: 2 }), { level: 6, stock: 9 }, 'metric')).toBe('2 Stock Lots · restocks below 6')
    expect(supplyRowMeta(makeSupplyTotal({ lotCount: 1, total: 2 }), { level: 6, stock: 2 }, 'metric')).toBe('1 Stock Lot · below Restock level 6')
    expect(supplyRowMeta(makeSupplyTotal({ lotCount: 1 }), null, 'metric')).toBe('1 Stock Lot')
  })
  it('ignores a stray next go-off date', () => {
    expect(supplyRowMeta(makeSupplyTotal({ lotCount: 1, nextGoesOff: '2026-11-12', useSoon: true }), null, 'metric')).toBe('1 Stock Lot')
  })
})

describe('checkUsedUp: how much was used up', () => {
  const lot = { quantity: 6 }
  it('blank means the whole Lot (undefined)', () => {
    expect(checkUsedUp('', lot)).toEqual({ ok: true, used: undefined })
    expect(checkUsedUp('  ', lot)).toEqual({ ok: true, used: undefined })
  })
  it('the whole quantity typed is the whole Lot too', () => {
    expect(checkUsedUp('6', lot)).toEqual({ ok: true, used: undefined })
  })
  it('part of it is that amount; a decimal comma works', () => {
    expect(checkUsedUp('2', lot)).toEqual({ ok: true, used: 2 })
    expect(checkUsedUp('1,5', lot)).toEqual({ ok: true, used: 1.5 })
  })
  it('refuses more than the Lot holds, zero, a negative and a word', () => {
    expect(checkUsedUp('7', lot)).toEqual({ ok: false, error: 'tooMuch' })
    expect(checkUsedUp('0', lot)).toEqual({ ok: false, error: 'notPositive' })
    expect(checkUsedUp('-1', lot)).toEqual({ ok: false, error: 'negative' })
    expect(checkUsedUp('lots', lot)).toEqual({ ok: false, error: 'invalid' })
  })
})

describe('usedUpRequest: what Used up sends (no new API; never waste)', () => {
  it('the whole Lot is a DELETE of the Lot', () => {
    expect(usedUpRequest({ id: 31, quantity: 6 }, undefined)).toEqual({ type: 'delete' })
    expect(usedUpRequest({ id: 31, quantity: 6 }, 6)).toEqual({ type: 'delete' })
    expect(usedUpRequest({ id: 31, quantity: 6 }, 9)).toEqual({ type: 'delete' })
  })
  it('part of it is a PATCH with the quantity that remains', () => {
    expect(usedUpRequest({ id: 31, quantity: 6 }, 2)).toEqual({ type: 'patch', quantity: 4 })
    expect(usedUpRequest({ id: 31, quantity: 1 }, 0.4)).toEqual({ type: 'patch', quantity: 0.6 })
  })
})

describe('supplyLotLineMeta', () => {
  it('says when it was bought and where it is, never a go-off part', () => {
    const lot = makeSupplyLot({ purchased: '2026-11-12', goesOff: '2026-11-13', useSoon: true })
    expect(supplyLotLineMeta(lot, '2026-11-12', 'Utility cupboard')).toBe('Bought today · Utility cupboard')
    expect(supplyLotLineMeta(lot, '2026-11-12', null)).toBe('Bought today · Not sorted')
  })
})
