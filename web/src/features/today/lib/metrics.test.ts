// DS-TODAY (docs/design/system.md §2, §4): the Today metric strip: zero-waste streak, Leftovers to use, Lines to get.
// Colour roles: success (streak), the leftover teal (Leftovers), the accent container (Lines to get).
import { describe, expect, it } from 'vitest'
import { composeMetrics, countLinesToGet } from './metrics'

describe('composeMetrics', () => {
  it('is the three metrics in this order, each with a tone and an icon', () => {
    expect(composeMetrics({ streakDays: 2, leftovers: 3, linesToGet: 16 })).toEqual([
      { id: 'streak', value: '2 d', label: 'zero-waste streak', tone: 'success', icon: 'streak' },
      { id: 'leftovers', value: '3', label: 'Leftovers to use', tone: 'leftover', icon: 'leftover' },
      { id: 'lines', value: '16', label: 'Lines to get', tone: 'accent', icon: 'shop' },
    ])
  })

  it('the streak is "3 wk" from a week on, as before', () => {
    expect(composeMetrics({ streakDays: 21, leftovers: 0, linesToGet: 0 })[0]).toMatchObject({ id: 'streak', value: '3 wk' })
  })

  it('leaves out a metric with nothing to say: no streak under one day, no zero counts', () => {
    expect(composeMetrics({ streakDays: 0, leftovers: 0, linesToGet: 0 })).toEqual([])
    expect(composeMetrics({ streakDays: 0, leftovers: 2, linesToGet: 0 }).map((m) => m.id)).toEqual(['leftovers'])
    expect(composeMetrics({ streakDays: 0, leftovers: 2, linesToGet: 0, leftoversTile: false }).map((m) => m.id)).toEqual(['leftovers'])
    expect(composeMetrics({ streakDays: 5, leftovers: 0, linesToGet: 4 }).map((m) => m.id)).toEqual(['streak', 'lines'])
  })

  it('the labels use the Glossary words ("Leftovers", "Lines")', () => {
    const labels = composeMetrics({ streakDays: 1, leftovers: 1, linesToGet: 1 }).map((m) => m.label)
    expect(labels.join(' ')).not.toMatch(/\b(items?|products?|left-overs?|left overs?)\b/i)
  })
})

// DS-TODAY round 2: while the Leftovers tile shows (it lists them and says how many), the "Leftovers to use" metric would say it twice.
describe('composeMetrics: the Leftovers tile and the Leftovers metric', () => {
  it('leftoversTile: true leaves the Leftovers metric out', () => {
    expect(composeMetrics({ streakDays: 2, leftovers: 3, linesToGet: 16, leftoversTile: true }).map((m) => m.id)).toEqual(['streak', 'lines'])
    expect(composeMetrics({ streakDays: 0, leftovers: 3, linesToGet: 0, leftoversTile: true })).toEqual([])
  })
})

describe('countLinesToGet', () => {
  it('counts the Lines still to buy: not ticked', () => {
    expect(countLinesToGet([{ ticked: false }, { ticked: true }, { ticked: false }])).toBe(2)
  })
  it('is 0 for no list yet', () => {
    expect(countLinesToGet(undefined)).toBe(0)
    expect(countLinesToGet([])).toBe(0)
  })
})
