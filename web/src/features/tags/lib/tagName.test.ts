// checkTagName / normaliseTagName: the same name rule as Go tag (spec 4.1): 1 to 40 characters, trimmed and collapsed, case kept.
import { describe, expect, it } from 'vitest'
import { fish, pasta, seafood } from '../fixtures'
import { MAX_TAG_NAME, checkTagName, normaliseTagName } from './tagName'

const tags = [fish, pasta, seafood]

describe('normaliseTagName', () => {
  it('trims, collapses inner whitespace and keeps the case', () => {
    expect(normaliseTagName('  Sea   food \t')).toBe('Sea food')
    expect(normaliseTagName('Fish')).toBe('Fish')
  })
})

describe('checkTagName', () => {
  it('gives the normalised name', () => expect(checkTagName('  Soup  ', tags)).toEqual({ ok: true, name: 'Soup' }))

  it('refuses an empty or blank name', () => {
    for (const raw of ['', '   ', '\t\n']) {
      expect(checkTagName(raw, tags)).toEqual({ ok: false, reason: 'empty', message: 'Give the Tag a name.' })
    }
  })

  it('allows exactly 40 characters and refuses 41, counting characters not bytes', () => {
    expect(MAX_TAG_NAME).toBe(40)
    expect(checkTagName('a'.repeat(40), tags).ok).toBe(true)
    expect(checkTagName('a'.repeat(41), tags)).toEqual({ ok: false, reason: 'too_long', message: 'A Tag name has at most 40 characters.' })
    expect(checkTagName('é'.repeat(40), tags).ok).toBe(true)
    expect(checkTagName('🍝'.repeat(40), tags).ok).toBe(true)
  })

  it('counts the length after collapsing the spaces', () => expect(checkTagName(`${'a'.repeat(38)}    b`, tags).ok).toBe(true))

  it('is taken when another Tag has the key, whatever the case or spacing, and names that Tag', () => {
    expect(checkTagName('seafood', tags)).toEqual({ ok: false, reason: 'taken', message: 'There is already a Tag called Seafood', other: seafood })
    expect(checkTagName('  SEAFOOD ', tags)).toMatchObject({ ok: false, reason: 'taken', other: seafood })
  })

  it('accents count: Purée and Puree are two Tags', () => {
    const puree = { ...pasta, id: 9, name: 'Puree', key: 'puree' }
    expect(checkTagName('Purée', [puree]).ok).toBe(true)
    expect(checkTagName('Puree', [puree]).ok).toBe(false)
  })

  it('a Tag does not clash with itself: a new spelling of its own key is an ordinary rename', () => {
    expect(checkTagName('Fish', tags, fish.id)).toEqual({ ok: true, name: 'Fish' })
    expect(checkTagName('fish', tags, fish.id)).toEqual({ ok: true, name: 'fish' })
  })

  it('but another Tag still clashes on a rename', () => {
    expect(checkTagName('seafood', tags, fish.id)).toMatchObject({ ok: false, reason: 'taken', other: seafood })
  })

  it('checks empty before long before taken', () => {
    expect(checkTagName('', tags)).toMatchObject({ reason: 'empty' })
    expect(checkTagName('seafood'.padEnd(50, 'x'), tags)).toMatchObject({ reason: 'too_long' })
  })
})
