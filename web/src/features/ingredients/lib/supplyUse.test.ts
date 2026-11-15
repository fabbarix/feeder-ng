// H9 (household-items.md section 4.11): the pure rules of the Supplies list's stock level and quick Use. No React.
//
//   stockLevel(total, level, baseUnit, system) -> { text, compact, below }  (the wording is lib/restock, decision SSP 4)
//     Stock under the level    -> "Below 6 · 4 in Stock", compact "4 in Stock"   (below = true; no Stock reads 0)
//     Stock at or over it      -> "9 in Stock · Restocks below 6", compact "9 in Stock" (below = false)
//     no level                 -> "9 pieces"; no level and no Stock -> "None in Stock"
//     A piece amount is the bare number; a g or ml amount carries its unit ("Below 500 ml · 250 ml in Stock").
//   canUse(total)                       Stock above 0 (beyond float dust)
//   usesInOneTap(baseUnit)              pieces use 1 per tap; g and ml open the "how much" sheet
//   sheetStart(packSize, total)         the sheet's first amount: the pack size of the Product last bought, capped to Stock; null = none known
//   checkUseAmount(value, total, baseUnit, system)   { ok, value } or { ok: false, error }
//   usedAmount(name, quantity, baseUnit, system)     "1 Toilet paper", "250 ml of Dish soap" (the toasts' wording)
//   useLabel(name, baseUnit)            the button's accessible name: "Use one Toilet paper" / "Use some Dish soap"
import { describe, expect, it } from 'vitest'
import { formatQuantity } from '../../../lib/units'
import { canUse, checkUseAmount, sheetStart, stockLevel, usedAmount, useLabel, usesInOneTap } from './supplyUse'

describe('stockLevel', () => {
  it('says "Below 6 · 4 in Stock" for Stock under the level, with the info flag and the compact "4 in Stock"', () => {
    expect(stockLevel(4, 6, 'piece', 'metric')).toEqual({ text: 'Below 6 · 4 in Stock', compact: '4 in Stock', below: true })
    expect(stockLevel(1, 6, 'piece', 'metric')).toEqual({ text: 'Below 6 · 1 in Stock', compact: '1 in Stock', below: true })
  })
  it('says "Restocks below" while Stock is at or over the level', () => {
    expect(stockLevel(9, 6, 'piece', 'metric')).toEqual({ text: '9 in Stock · Restocks below 6', compact: '9 in Stock', below: false })
    expect(stockLevel(6, 6, 'piece', 'metric')).toEqual({ text: '6 in Stock · Restocks below 6', compact: '6 in Stock', below: false })
  })
  it('shows only the Stock when there is no Restock level', () => {
    expect(stockLevel(9, null, 'piece', 'metric')).toEqual({ text: '9 pieces', compact: '', below: false })
  })
  it('reads 0 in Stock for no Stock under a level, and "None in Stock" without one', () => {
    expect(stockLevel(0, 6, 'piece', 'metric')).toEqual({ text: 'Below 6 · 0 in Stock', compact: '0 in Stock', below: true })
    expect(stockLevel(0, null, 'piece', 'metric')).toEqual({ text: 'None in Stock', compact: '', below: false })
    expect(stockLevel(0, 500, 'ml', 'metric')).toEqual({ text: 'Below 500 ml · 0 ml in Stock', compact: '0 ml in Stock', below: true })
  })
  it('gives a g or ml amount its unit', () => {
    expect(stockLevel(250, 500, 'ml', 'metric')).toEqual({ text: 'Below 500 ml · 250 ml in Stock', compact: '250 ml in Stock', below: true })
    expect(stockLevel(800, 500, 'ml', 'metric')).toEqual({ text: '800 ml in Stock · Restocks below 500 ml', compact: '800 ml in Stock', below: false })
    expect(stockLevel(1000, 2000, 'g', 'metric')).toEqual({ text: 'Below 2 kg · 1 kg in Stock', compact: '1 kg in Stock', below: true })
  })
  it('shows g and ml in the household display system', () => {
    const stock = formatQuantity(1000, 'g', 'imperial')
    const level = formatQuantity(2000, 'g', 'imperial')
    expect(stockLevel(1000, 2000, 'g', 'imperial').text).toBe(`Below ${level} · ${stock} in Stock`)
  })
  it('treats float dust under the level as at the level', () => {
    expect(stockLevel(0.1 + 0.2, 0.3, 'g', 'metric').below).toBe(false)
    expect(stockLevel(0.3 - 1e-12, 0.3, 'g', 'metric').below).toBe(false)
  })
  it('reads dust above 0 as no Stock', () => {
    expect(stockLevel(1e-12, null, 'g', 'metric')).toEqual({ text: 'None in Stock', compact: '', below: false })
  })
})

describe('canUse and usesInOneTap', () => {
  it('can use only when there is Stock', () => {
    expect(canUse(4)).toBe(true)
    expect(canUse(0.5)).toBe(true)
    expect(canUse(0)).toBe(false)
    expect(canUse(1e-12)).toBe(false)
    expect(canUse(Number.NaN)).toBe(false)
  })
  it('uses one piece in one tap, and asks "how much" for g and ml', () => {
    expect(usesInOneTap('piece')).toBe(true)
    expect(usesInOneTap('g')).toBe(false)
    expect(usesInOneTap('ml')).toBe(false)
  })
})

describe('sheetStart', () => {
  it('starts at the pack size of the Product last bought', () => {
    expect(sheetStart(500, 800)).toBe(500)
  })
  it('never starts above what is in Stock', () => {
    expect(sheetStart(500, 300)).toBe(300)
  })
  it('starts empty when no pack size is known', () => {
    expect(sheetStart(null, 800)).toBeNull()
    expect(sheetStart(0, 800)).toBeNull()
  })
})

describe('checkUseAmount', () => {
  it('accepts an amount up to what is in Stock', () => {
    expect(checkUseAmount(250, 800, 'ml', 'metric')).toEqual({ ok: true, value: 250 })
    expect(checkUseAmount(800, 800, 'ml', 'metric')).toEqual({ ok: true, value: 800 })
  })
  it('asks for an amount when there is none', () => {
    expect(checkUseAmount(null, 800, 'ml', 'metric')).toEqual({ ok: false, error: 'Enter how much you used' })
  })
  it('refuses 0 or less', () => {
    expect(checkUseAmount(0, 800, 'ml', 'metric')).toEqual({ ok: false, error: 'Use more than 0' })
    expect(checkUseAmount(-5, 800, 'ml', 'metric')).toEqual({ ok: false, error: 'Use more than 0' })
    expect(checkUseAmount(Number.NaN, 800, 'ml', 'metric')).toEqual({ ok: false, error: 'Use more than 0' })
  })
  it('refuses more than is in Stock, naming the Stock', () => {
    expect(checkUseAmount(801, 800, 'ml', 'metric')).toEqual({ ok: false, error: 'Only 800 ml in Stock' })
    expect(checkUseAmount(3, 2, 'piece', 'metric')).toEqual({ ok: false, error: 'Only 2 pieces in Stock' })
  })
})

describe('usedAmount and useLabel', () => {
  it('words a piece count before the name', () => {
    expect(usedAmount('toilet paper', 1, 'piece', 'metric')).toBe('1 Toilet paper')
    expect(usedAmount('toilet paper', 3, 'piece', 'metric')).toBe('3 Toilet paper')
  })
  it('words a g or ml amount with "of"', () => {
    expect(usedAmount('dish soap', 250, 'ml', 'metric')).toBe('250 ml of Dish soap')
    expect(usedAmount('flour', 1000, 'g', 'imperial')).toBe(`${formatQuantity(1000, 'g', 'imperial')} of Flour`)
  })
  it('names the button after the Supply', () => {
    expect(useLabel('toilet paper', 'piece')).toBe('Use one Toilet paper')
    expect(useLabel('dish soap', 'ml')).toBe('Use some Dish soap')
    expect(useLabel('flour', 'g')).toBe('Use some Flour')
  })
})
