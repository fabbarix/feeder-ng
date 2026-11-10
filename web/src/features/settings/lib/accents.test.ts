import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS, isHexColour } from './accents'
import { DEFAULT_PREFERENCES } from './defaults'

describe('ACCENT_PRESETS', () => {
  it('offers at least six named, valid, distinct colours starting with the default accent', () => {
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(6)
    expect(ACCENT_PRESETS[0]!.hex).toBe(DEFAULT_PREFERENCES.accent)
    for (const p of ACCENT_PRESETS) {
      expect(p.name).not.toBe('')
      expect(isHexColour(p.hex)).toBe(true)
    }
    expect(new Set(ACCENT_PRESETS.map((p) => p.hex)).size).toBe(ACCENT_PRESETS.length)
  })
})

describe('isHexColour', () => {
  it.each(['#3f7d58', '#FFFFFF', '#000000'])('accepts %s', (v) => expect(isHexColour(v)).toBe(true))
  it.each(['', 'red', '3f7d58', '#fff', '#3f7d5', '#3f7d58a', '#gggggg'])('rejects %j', (v) => expect(isHexColour(v)).toBe(false))
})

describe('DEFAULT_PREFERENCES', () => {
  it('matches the server defaults', () => {
    expect(DEFAULT_PREFERENCES).toEqual({ scheme: 'system', accent: '#3f7d58', units: 'metric' })
  })
})
