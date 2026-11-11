import { describe, expect, it } from 'vitest'
import type { Why } from '../types'
import { phraseAll, phraseWhy, weekdayName } from './phrase'

// 2026-11-09 is a Monday.
const ctx = { slotDate: '2026-11-13' } // a Friday

describe('weekdayName', () => {
  it('names the weekday of a date, long or short, whatever the browser locale', () => {
    expect(weekdayName('2026-11-09')).toBe('Monday')
    expect(weekdayName('2026-11-12', 'short')).toBe('Thu')
    expect(weekdayName('2026-11-15')).toBe('Sunday')
    expect(weekdayName('2028-02-29', 'short')).toBe('Tue')
  })
})

describe('phraseWhy', () => {
  it('ingredient overlap: uses Monday\'s chicken', () => {
    const why: Why = { code: 'ingredient_overlap', ingredient: 'chicken', date: '2026-11-09' }
    expect(phraseWhy(why, ctx)).toBe("uses Monday's chicken")
  })

  it('favourite: one, two or many Members', () => {
    expect(phraseWhy({ code: 'favourite', members: ['Anna'] }, ctx)).toBe("Anna's favourite")
    expect(phraseWhy({ code: 'favourite', members: ['Anna', 'Ben'] }, ctx)).toBe("Anna and Ben's favourite")
    expect(phraseWhy({ code: 'favourite', members: ['Anna', 'Ben', 'Cleo'] }, ctx)).toBe('a favourite of 3')
    expect(phraseWhy({ code: 'favourite' }, ctx)).toBe('a favourite')
  })

  it('perishable use: uses spinach by Thu: Thu is the last good day, the go-off date (GW)', () => {
    expect(phraseWhy({ code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }, ctx)).toBe('uses spinach by Thu')
    expect(phraseWhy({ code: 'perishable_use', ingredient: 'spinach' }, ctx)).toBe('uses up the spinach')
  })

  it('slot rule: names the weekday of the slot', () => {
    expect(phraseWhy({ code: 'slot_rule', tag: 'pizza' }, ctx)).toBe('Slot Rule: Friday')
    expect(phraseWhy({ code: 'slot_rule', tag: 'pizza' }, { slotDate: '2026-11-10' })).toBe('Slot Rule: Tuesday')
  })

  it('leftover: Leftover from Tue (capitalised glossary term, short weekday)', () => {
    expect(phraseWhy({ code: 'leftover', date: '2026-11-10' }, ctx)).toBe('Leftover from Tue')
    expect(phraseWhy({ code: 'leftover' }, ctx)).toBe('Leftover')
  })

  it('stock coverage names the Ingredient, leftover fits says Leftover for Wed', () => {
    expect(phraseWhy({ code: 'stock_coverage', ingredient: 'chicken thighs' }, ctx)).toBe('uses Stock: chicken thighs')
    expect(phraseWhy({ code: 'stock_coverage' }, ctx)).toBe('uses what is in Stock')
    expect(phraseWhy({ code: 'leftover_fits', date: '2026-11-11' }, ctx)).toBe('Leftover for Wed')
    expect(phraseWhy({ code: 'leftover_fits' }, ctx)).toBe('Leftovers to come')
  })

  it('best available is dropped: no reason is better than a non-reason', () => {
    expect(phraseWhy({ code: 'best_available' }, ctx)).toBe('')
  })

  it('an unknown code gives an empty string', () => {
    expect(phraseWhy({ code: 'from_the_future' as Why['code'] }, ctx)).toBe('')
  })
})

describe('phraseAll', () => {
  it('keeps the order, drops unknown chips and shows at most three', () => {
    const chips: Why[] = [
      { code: 'slot_rule', tag: 'pizza' },
      { code: 'from_the_future' as Why['code'] },
      { code: 'favourite', members: ['Anna'] },
      { code: 'stock_coverage', ingredient: 'rice' },
      { code: 'best_available' },
      { code: 'leftover', date: '2026-11-10' },
    ]
    expect(phraseAll(chips, ctx)).toEqual(['Slot Rule: Friday', "Anna's favourite", 'uses Stock: rice'])
  })

  it('no chips, no phrases', () => {
    expect(phraseAll([], ctx)).toEqual([])
  })
})
