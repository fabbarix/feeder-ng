// SF-misc: the GLOSSARY term is "Household", capitalised, in every access and signin string.
import { describe, expect, it } from 'vitest'
import { accessStrings as access } from './strings'
import { signinStrings as signin } from '../signin/strings'

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts)
  return []
}

describe('Household is capitalised in the access and signin copy', () => {
  it.each([
    ['access', access],
    ['signin', signin],
  ])('%s strings never say "household" in lower case', (_name, strings) => {
    const all = texts(strings)
    expect(all.length).toBeGreaterThan(0)
    for (const t of all) expect(t).not.toMatch(/\bhousehold\b/)
  })
  it('the waiting and full pages name the Household', () => {
    expect(texts(access).join(' ')).toContain('Someone in the Household')
    expect(texts(access).join(' ')).toContain('Ask someone in the Household')
  })
})
