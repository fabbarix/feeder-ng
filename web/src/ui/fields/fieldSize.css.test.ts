// R2-F (F-01): the size tokens and the data-size rules. Flat-CSS reads (jsdom has no layout).
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss, readUiCss } from '../test-utils'

const field = readUiCss('fields/Field.css')
const search = readUiCss('fields/SearchField.css')
const all = field + readStylesCss()

const TOKENS: Record<string, string> = { xs: '112px', sm: '168px', md: '320px', lg: '480px' }

describe('field size tokens', () => {
  it.each(Object.entries(TOKENS))('--field-size-%s is %s', (size, px) => {
    expect(all).toMatch(new RegExp(`--field-size-${size}\\s*:\\s*${px}\\s*;`))
  })

  it('a stepper NumberField at xs has its own 136 px token (never stretched)', () => {
    expect(all).toMatch(/--field-size-xs-stepper\s*:\s*136px\s*;/)
  })
})

describe('data-size rules cap the inline size with the tokens', () => {
  it.each(['xs', 'sm', 'md', 'lg'])('.ui-field[data-size=%s] -> max-inline-size: var(--field-size-%s)', (size) => {
    const d = declarations(field, `.ui-field[data-size='${size}']`)
    expect(d['max-inline-size']).toBe(`var(--field-size-${size})`)
  })

  it('full is 100 %', () => {
    expect(declarations(field, ".ui-field[data-size='full']")['max-inline-size']).toBe('100%')
  })

  it('a field is its container width up to the cap (inline-size 100 %, min-inline-size 0), never a fixed width', () => {
    const d = declarations(field, '.ui-field')
    expect(d['inline-size']).toBe('100%')
    expect(d['min-inline-size']).toBe('0')
    for (const size of ['xs', 'sm', 'md', 'lg']) expect(declarations(field, `.ui-field[data-size='${size}']`)['inline-size']).toBeUndefined()
  })

  it('the stepper NumberField at xs uses the stepper token', () => {
    const d = declarations(field, ".ui-field--stepper[data-size='xs']")
    expect(d['max-inline-size']).toBe('var(--field-size-xs-stepper)')
  })

  it('SearchField carries the same data-size rules with the same tokens', () => {
    for (const size of ['xs', 'sm', 'md', 'lg']) {
      expect(declarations(search + field, `.search-field[data-size='${size}']`)['max-inline-size'], size).toBe(`var(--field-size-${size})`)
    }
    expect(declarations(search + field, ".search-field[data-size='full']")['max-inline-size']).toBe('100%')
  })

  it('uses no raw px max-inline-size in a data-size rule (tokens only)', () => {
    for (const size of ['xs', 'sm', 'md', 'lg', 'full']) {
      expect(declarations(field, `.ui-field[data-size='${size}']`)['max-inline-size']).not.toMatch(/^\d+px$/)
    }
  })
})
