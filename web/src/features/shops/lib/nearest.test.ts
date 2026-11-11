import { describe, expect, it } from 'vitest'
import { MAX_NEAR_METRES, NEAR_METRES, distanceMetres, formatDistance, goodForSaving, locationToSave, nearRadius, nearestShop } from './nearest'

// Milan Duomo and two points about 100 m and 700 m east of it.
const duomo = { lat: 45.4642, lon: 9.19 }
const east100 = { lat: 45.4642, lon: 9.19128 }
const east700 = { lat: 45.4642, lon: 9.199 }

describe('distanceMetres', () => {
  it('is zero for the same point and symmetric', () => {
    expect(distanceMetres(duomo, duomo)).toBe(0)
    expect(distanceMetres(duomo, east100)).toBeCloseTo(distanceMetres(east100, duomo), 6)
  })
  it('measures about 100 m and 700 m', () => {
    expect(distanceMetres(duomo, east100)).toBeGreaterThan(95)
    expect(distanceMetres(duomo, east100)).toBeLessThan(105)
    expect(distanceMetres(duomo, east700)).toBeGreaterThan(690)
    expect(distanceMetres(duomo, east700)).toBeLessThan(710)
  })
  it('knows London to Paris is about 344 km', () => {
    expect(distanceMetres({ lat: 51.5072, lon: -0.1276 }, { lat: 48.8566, lon: 2.3522 }) / 1000).toBeCloseTo(343.5, 0)
  })
})

describe('nearRadius', () => {
  it('adds the fix accuracy to the base radius, capped', () => {
    expect(nearRadius(0)).toBe(NEAR_METRES)
    expect(nearRadius(30)).toBe(NEAR_METRES + 30)
    expect(nearRadius(5000)).toBe(MAX_NEAR_METRES)
    expect(nearRadius(Number.NaN)).toBe(NEAR_METRES)
  })
})

describe('nearestShop', () => {
  const far = { id: 1, name: 'Far', location: east700 }
  const unsaved = { id: 3, name: 'Unsaved', location: null }
  const oldFixture = { id: 4, name: 'Old fixture' }
  const shops = [far, { id: 2, name: 'Near', location: east100 }, unsaved, oldFixture]
  it('picks the closest Shop within the radius', () => {
    const got = nearestShop(shops, { ...duomo, accuracy: 10 })
    expect(got?.shop.name).toBe('Near')
    expect(got?.metres).toBeLessThan(105)
  })
  it('gives null when every Shop is too far', () => {
    expect(nearestShop([far], { ...duomo, accuracy: 10 })).toBeNull()
  })
  it('lets a poor fix reach further', () => {
    expect(nearestShop([far], { ...duomo, accuracy: 600 })?.shop.name).toBe('Far')
  })
  it('skips Shops without a Shop Location', () => {
    expect(nearestShop([unsaved, oldFixture], { ...duomo, accuracy: 10 })).toBeNull()
  })
})

describe('formatDistance', () => {
  it('rounds metres to tens and switches to km', () => {
    expect(formatDistance(4)).toBe('0 m')
    expect(formatDistance(43)).toBe('40 m')
    expect(formatDistance(949)).toBe('950 m')
    expect(formatDistance(1234)).toBe('1.2 km')
  })
})

describe('goodForSaving', () => {
  it('accepts a street-level fix and refuses a city-wide guess', () => {
    expect(goodForSaving({ ...duomo, accuracy: 25 })).toBe(true)
    expect(goodForSaving({ ...duomo, accuracy: 2000 })).toBe(false)
  })
})

describe('locationToSave', () => {
  const fix = { ...duomo, accuracy: 20 }
  it('saves a good fix the User wants, without its accuracy', () => {
    expect(locationToSave(true, fix)).toEqual(duomo)
  })
  it('saves nothing when unwanted, missing or too rough', () => {
    expect(locationToSave(false, fix)).toBeNull()
    expect(locationToSave(true, null)).toBeNull()
    expect(locationToSave(true, { ...duomo, accuracy: 3000 })).toBeNull()
  })
})
