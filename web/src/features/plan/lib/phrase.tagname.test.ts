// TG-PW: a variety_relaxed chip says the Tag's name ("3rd Fish this week"), and the key when the Tag is gone.
import { describe, expect, it } from 'vitest'
import { phraseWhy } from './phrase'

const names: Record<string, string> = { fish: 'Fish' }
const ctx = { slotDate: '2026-11-10', tagName: (key: string) => names[key] }

describe('variety_relaxed with a Tag name lookup', () => {
  it('uses the Tag name for the count', () => {
    expect(phraseWhy({ code: 'variety_relaxed', tag: 'fish', value: 3 }, ctx)).toBe('3rd Fish this week')
  })
  it('uses the Tag name for the adjacent day', () => {
    expect(phraseWhy({ code: 'variety_relaxed', tag: 'fish', date: '2026-11-09' }, ctx)).toBe('Fish two days running')
  })
  it('says the key when the Tag is gone', () => {
    expect(phraseWhy({ code: 'variety_relaxed', tag: 'soup', value: 2 }, ctx)).toBe('2nd soup this week')
  })
  it('says the key when there is no lookup (the existing behaviour)', () => {
    expect(phraseWhy({ code: 'variety_relaxed', tag: 'fish', value: 3 }, { slotDate: '2026-11-10' })).toBe('3rd fish this week')
  })
})
