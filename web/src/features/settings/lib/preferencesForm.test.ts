import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from './defaults'
import { preferencesChanged } from './preferencesForm'

describe('preferencesChanged', () => {
  it('is false for an identical draft, whatever the hex case', () => {
    expect(preferencesChanged(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES })).toBe(false)
    expect(preferencesChanged(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES, accent: '#3F7D58' })).toBe(false)
  })

  it.each([{ scheme: 'dark' }, { units: 'imperial' }, { accent: '#112233' }])('is true for %o', (patch) => {
    expect(preferencesChanged(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES, ...patch } as typeof DEFAULT_PREFERENCES)).toBe(true)
  })
})
