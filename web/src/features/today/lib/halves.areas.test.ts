// w6a (B9-44, TB-03, TB-12; B9-53, TB-06): which rows the three-track areas name, so a lead tile sits above the hero and no empty row is left.
import { describe, expect, it } from 'vitest'
import { topAreas } from './halves'

describe('topAreas', () => {
  it('the usual Today: hero and To confirm, nothing leading', () => {
    expect(topAreas(['nextMeal', 'toConfirm', 'advanceSteps', 'metrics'], false)).toEqual({ head: 'hc', lead: '0' })
  })
  it('a Scan session puts the Shopping tile above the hero (TB-12: it spans the three tracks above the hero)', () => {
    expect(topAreas(['shopping', 'nextMeal', 'toConfirm'], false)).toEqual({ head: 'hc', lead: '1' })
  })
  it('the full checklist leads (TB-06); with a Shopping tile both lead', () => {
    expect(topAreas(['setup', 'nextMeal'], false)).toEqual({ head: 'h', lead: '1' })
    expect(topAreas(['shopping', 'setup', 'nextMeal', 'toConfirm'], false)).toEqual({ head: 'hc', lead: '2' })
  })
  it('the compact checklist does not lead: it follows the hero as a half tile', () => {
    expect(topAreas(['nextMeal', 'setup', 'toConfirm'], true)).toEqual({ head: 'hc', lead: '0' })
  })
  it('an empty plan: no hero and no To confirm leaves no hero row (head none)', () => {
    expect(topAreas(['setup', 'metrics'], false)).toEqual({ head: 'none', lead: '1' })
    expect(topAreas(['toConfirm', 'leftovers'], false)).toEqual({ head: 'c', lead: '0' })
  })
})
