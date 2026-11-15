// B9-13 (SSP-05, decision SSP 4): one Restock reason for Shop, Pantry and Supplies. "Below 4 · 2 in Stock", compact "2 in Stock", everywhere.
// Quantity text is B9-22's formatQuantity ("1.5 kg", "400 ml"); a piece count is bare ("2", "1,250").
import { describe, expect, it } from 'vitest'
import { isBelowLevel, restockReason } from './restock'
import { formatQuantity } from './units'

describe('restockReason: below the Restock level', () => {
  it('pieces are bare: "Below 4 · 2 in Stock", compact "2 in Stock"', () => {
    expect(restockReason(2, 4, 'piece', 'metric')).toEqual({ long: 'Below 4 · 2 in Stock', compact: '2 in Stock' })
  })
  it('millilitres name their unit on both: "Below 1 l · 400 ml in Stock"', () => {
    expect(restockReason(400, 1000, 'ml', 'metric')).toEqual({ long: 'Below 1 l · 400 ml in Stock', compact: '400 ml in Stock' })
  })
  it('grams: "Below 1.2 kg · 800 g in Stock"', () => {
    expect(restockReason(800, 1200, 'g', 'metric')).toEqual({ long: 'Below 1.2 kg · 800 g in Stock', compact: '800 g in Stock' })
  })
  it('big piece counts are grouped like B9-22: "Below 2,000 · 1,250 in Stock"', () => {
    expect(restockReason(1250, 2000, 'piece', 'metric').long).toBe('Below 2,000 · 1,250 in Stock')
  })
  it('imperial follows formatQuantity', () => {
    const r = restockReason(400, 1000, 'ml', 'imperial')
    expect(r.long).toBe(`Below ${formatQuantity(1000, 'ml', 'imperial')} · ${formatQuantity(400, 'ml', 'imperial')} in Stock`)
    expect(r.compact).toBe(`${formatQuantity(400, 'ml', 'imperial')} in Stock`)
  })
  it('no Stock at all reads 0, float dust included: "Below 4 · 0 in Stock", "0 ml in Stock"', () => {
    expect(restockReason(0, 4, 'piece', 'metric').long).toBe('Below 4 · 0 in Stock')
    expect(restockReason(1e-12, 4, 'piece', 'metric').long).toBe('Below 4 · 0 in Stock')
    expect(restockReason(1e-12, 1000, 'ml', 'metric').compact).toBe('0 ml in Stock')
  })
  it('a Pantry Stock Lot (quantity in the value column) still says it in full when below', () => {
    expect(restockReason(2, 4, 'piece', 'metric', { stockInReason: false }).long).toBe('Below 4 · 2 in Stock')
  })
})

describe('restockReason: not below the level', () => {
  it('Supplies: "60 in Stock · Restocks below 20", compact "60 in Stock"', () => {
    expect(restockReason(60, 20, 'piece', 'metric')).toEqual({ long: '60 in Stock · Restocks below 20', compact: '60 in Stock' })
  })
  it('at the level is not below', () => {
    expect(restockReason(20, 20, 'piece', 'metric').long).toBe('20 in Stock · Restocks below 20')
  })
  it('a Pantry Stock Lot leaves the Stock out: "Restocks below 20", with no shorter form', () => {
    expect(restockReason(60, 20, 'piece', 'metric', { stockInReason: false })).toEqual({ long: 'Restocks below 20', compact: '' })
  })
  it('units on the level: "Restocks below 1 l"', () => {
    expect(restockReason(2500, 1000, 'ml', 'metric', { stockInReason: false }).long).toBe('Restocks below 1 l')
  })
})

describe('restockReason: one wording', () => {
  it('never says "of", "Restock level" or lower-case "in stock"', () => {
    for (const r of [restockReason(2, 4, 'piece', 'metric'), restockReason(60, 20, 'piece', 'metric'), restockReason(400, 1000, 'ml', 'metric')]) {
      expect(r.long).not.toMatch(/\bof\b|Restock level|in stock|\//)
      expect(r.compact).not.toMatch(/\bof\b|Restock level|in stock|\//)
    }
  })
})

describe('isBelowLevel', () => {
  it('is strict, and float dust counts as 0', () => {
    expect(isBelowLevel(2, 4)).toBe(true)
    expect(isBelowLevel(4, 4)).toBe(false)
    expect(isBelowLevel(5, 4)).toBe(false)
    expect(isBelowLevel(1e-12, 4)).toBe(true)
    expect(isBelowLevel(0, 0)).toBe(false)
  })
})
