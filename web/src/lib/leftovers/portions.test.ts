import { describe, expect, it } from 'vitest'
import { places } from './fixtures'
import {
  defaultFreezer, freezeDefaultPortions, freezeUseBy, freezerPlaces, hadItDefault, portionBounds, takeOutPlaces,
  takeOutUseBy, throwOutDefault,
} from './portions'

describe('portion defaults', () => {
  it('Had it defaults to one portion, or what is left when less', () => {
    expect(hadItDefault(3)).toBe(1)
    expect(hadItDefault(0.5)).toBe(0.5)
  })
  it('Threw it out defaults to all that is left', () => {
    expect(throwOutDefault(2.5)).toBe(2.5)
  })
  it('the stepper goes 0.25 to what is left in 0.25 steps (PC-13)', () => {
    expect(portionBounds(3)).toEqual({ min: 0.25, max: 3, step: 0.25 })
  })
  it('Freeze it defaults to the portions no Planned Meal is planned to use', () => {
    expect(freezeDefaultPortions(5, 2)).toBe(3)
    expect(freezeDefaultPortions(5, 0)).toBe(5)
  })
  it('Freeze it keeps every spare quarter portion (PC-13: a 1.25 Leftover never strands 0.25)', () => {
    expect(freezeDefaultPortions(5.25, 2)).toBe(3.25)
    expect(freezeDefaultPortions(4.75, 2)).toBe(2.75)
    expect(freezeDefaultPortions(3, 0.25)).toBe(2.75)
    expect(freezeDefaultPortions(1.25, 0)).toBe(1.25)
    expect(freezeDefaultPortions(2.5, 1.25)).toBe(1.25)
  })
  it('Freeze it rounds a spare amount that is not a quarter down to the quarter', () => {
    expect(freezeDefaultPortions(2.6, 1.3)).toBe(1.25)
  })
  it('Freeze it defaults to all of them when every portion is planned', () => {
    expect(freezeDefaultPortions(2, 2)).toBe(2)
    expect(freezeDefaultPortions(2, 3)).toBe(2)
  })
})

describe('Storage Place choices', () => {
  it('freezerPlaces lists freezers by name; takeOutPlaces the others by name', () => {
    expect(freezerPlaces(places).map((p) => p.name)).toEqual(['Basement Freezer', 'Garage Freezer'])
    expect(takeOutPlaces(places).map((p) => p.name)).toEqual(['Garage Fridge', 'Kitchen Pantry'])
  })
  it('the default Storage Place wins when it is a freezer', () => {
    const withDefault = places.map((p) => ({ ...p, default: p.id === 2 }))
    expect(defaultFreezer(withDefault)?.name).toBe('Garage Freezer')
  })
  it('otherwise the first freezer by name', () => {
    expect(defaultFreezer(places)?.name).toBe('Basement Freezer')
  })
  it('is null with no freezer', () => {
    expect(defaultFreezer(places.filter((p) => p.kind !== 'freezer'))).toBeNull()
  })
})

describe('Use-by after Freeze it and Take out', () => {
  it('Freeze it: today + the Recipe Frozen Use-by, else the Household default', () => {
    expect(freezeUseBy('2026-11-12', null, 90)).toEqual({ date: '2027-02-10', days: 90 })
    expect(freezeUseBy('2026-11-12', 30, 90)).toEqual({ date: '2026-12-12', days: 30 })
  })
  it('Take out: today + the Recipe Use-by days', () => {
    expect(takeOutUseBy('2026-11-12', 3)).toEqual({ date: '2026-11-15', days: 3 })
  })
})

