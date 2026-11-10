import { describe, expect, it } from 'vitest'
import { acceptsFile } from './accept'

const f = (name: string, type = '') => ({ name, type })

describe('acceptsFile', () => {
  it('allows everything without an accept string', () => {
    expect(acceptsFile(f('a.bin'), undefined)).toBe(true)
    expect(acceptsFile(f('a.bin'), '')).toBe(true)
  })
  it('matches extensions case-insensitively', () => {
    expect(acceptsFile(f('Recipe.JSON'), '.json')).toBe(true)
    expect(acceptsFile(f('recipe.yaml'), '.json')).toBe(false)
  })
  it('matches exact MIME types and type/* wildcards', () => {
    expect(acceptsFile(f('x', 'image/png'), 'image/*')).toBe(true)
    expect(acceptsFile(f('x', 'application/pdf'), 'image/*,application/pdf')).toBe(true)
    expect(acceptsFile(f('x', 'text/plain'), 'image/*')).toBe(false)
  })
  it('accepts any entry of a comma list with spaces', () => {
    expect(acceptsFile(f('a.md'), '.json, .md')).toBe(true)
  })
})
