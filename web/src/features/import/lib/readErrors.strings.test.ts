// The copy of a failed read lives in strings.ts (so the glossary guard scans it); readErrors.ts only maps codes to it.
import { describe, expect, it } from 'vitest'
import { readSource } from '../../plan/test-css'
import { readStrings } from '../strings'

describe('read error copy lives in strings.ts', () => {
  it('readStrings.errors holds the sentences', () => {
    const errors = (readStrings as unknown as { errors?: Record<string, unknown> }).errors
    expect(errors?.assistant_busy).toBe('Anthropic is busy. Try again in a minute.')
    expect(errors?.no_recipe_found).toBe('No recipe was found in this page, text or photo.')
    expect(errors?.read_unavailable).toBe('The read could not be started. Reload the page and try again.')
  })
  it('readErrors.ts holds no sentence of its own', () => {
    const source = readSource('features/import/lib/readErrors.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(source).not.toBe('')
    expect(source).not.toMatch(/Anthropic|Try again|Recipe Assistant|API key|Ask an Admin|too long/i)
  })
})
