import { describe, expect, it } from 'vitest'
import type { Conflict } from '../types'
import { buildMergeRequest, conflictKey, isResolved, sideValue } from './mergeResolution'

const jar: Conflict = { kind: 'conversion', unit: 'jar', source: 700, target: 680 }
const life: Conflict = { kind: 'shelfLife', unit: '', source: 5, target: 9 }

describe('mergeResolution', () => {
  it('keys conflicts', () => {
    expect(conflictKey(jar)).toBe('conversion:jar')
    expect(conflictKey(life)).toBe('shelfLife')
  })
  it('reads a side', () => {
    expect(sideValue(jar, 'source')).toBe(700)
    expect(sideValue(jar, 'target')).toBe(680)
  })
  it('is resolved only when every conflict is answered', () => {
    expect(isResolved([], {})).toBe(true)
    expect(isResolved([jar, life], {})).toBe(false)
    expect(isResolved([jar, life], { 'conversion:jar': 690 })).toBe(false)
    expect(isResolved([jar, life], { 'conversion:jar': 690, shelfLife: 5 })).toBe(true)
  })
  it('counts null as an answer for Shelf Life but not for a conversion', () => {
    expect(isResolved([life], { shelfLife: null })).toBe(true)
    expect(isResolved([jar], { 'conversion:jar': null })).toBe(false)
  })
  it('builds the request', () => {
    expect(buildMergeRequest(9, [jar, life], { 'conversion:jar': 690, shelfLife: null, 'conversion:stale': 1 })).toEqual({
      into: 9,
      resolutions: { conversions: { jar: 690 }, shelfLifeDays: null },
    })
    expect(buildMergeRequest(9, [jar], { 'conversion:jar': 700 })).toEqual({ into: 9, resolutions: { conversions: { jar: 700 } } })
    expect(buildMergeRequest(9, [], {})).toEqual({ into: 9 })
  })
})
