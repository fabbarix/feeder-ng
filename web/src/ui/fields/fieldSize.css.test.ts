// R2-F (F-01): the size tokens and the data-size rules. Flat-CSS reads (jsdom has no layout).
// SET-07 (B9-16): a field's size token limits its CONTROL, never its label, helper or error. `.ui-field[data-size]` no longer sets
// max-inline-size: it sets --field-control-max, which the control (and the Select trigger, a direct child) takes; the helper and the
// error span the field's full track, up to 60 ch.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss, readUiCss, ruleBlocks } from '../test-utils'

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

describe('data-size rules set the control cap with the tokens, and never cap the frame (SET-07)', () => {
  it.each(['xs', 'sm', 'lg'])('size %s caps the control with its --field-size token', (size) => {
    const d = declarations(field, `.ui-field[data-size='${size}']`)
    expect(d['--field-control-max']).toBe(`var(--field-size-${size})`)
    expect(d['max-inline-size']).toBeUndefined()
  })

  it('md is capped at the container too, so phone right edges align (min(token, 100%))', () => {
    expect(declarations(field, ".ui-field[data-size='md']")['--field-control-max']).toBe('min(var(--field-size-md), 100%)')
    expect(declarations(search, ".search-field[data-size='md']")['max-inline-size']).toBe('min(var(--field-size-md), 100%)')
  })

  it('full is 100 %', () => {
    expect(declarations(field, ".ui-field[data-size='full']")['--field-control-max']).toBe('100%')
  })

  it('the frame, the label, the helper and the error are never capped by the size (no max-inline-size on .ui-field[data-size])', () => {
    for (const size of ['xs', 'sm', 'md', 'lg', 'full']) {
      expect(declarations(field, `.ui-field[data-size='${size}']`)['max-inline-size'], size).toBeUndefined()
    }
  })

  it('the control takes the cap: a direct child of the frame other than the label, helper and error', () => {
    const rule = ruleBlocks(field).find((r) => /max-inline-size:\s*var\(--field-control-max\)/.test(r.body))
    expect(rule, 'a rule with max-inline-size: var(--field-control-max)').toBeDefined()
    const selector = rule!.selectors.join(' ')
    expect(selector).toMatch(/\.ui-field\[data-size\]\s*>/)
    for (const cls of ['ui-field__label', 'ui-field__helper', 'ui-field__error']) expect(selector, cls).toContain(cls)
    expect(selector).toMatch(/:not\(/) // the label, helper and error are the exceptions
  })

  it('a field is its container width, never a fixed width (inline-size 100 %, min-inline-size 0)', () => {
    const d = declarations(field, '.ui-field')
    expect(d['inline-size']).toBe('100%')
    expect(d['min-inline-size']).toBe('0')
    for (const size of ['xs', 'sm', 'md', 'lg']) expect(declarations(field, `.ui-field[data-size='${size}']`)['inline-size']).toBeUndefined()
  })

  it('the helper and the error span the field track, up to 60 ch', () => {
    for (const sel of ['.ui-field__helper', '.ui-field__error']) {
      const d = declarations(field, sel)
      expect(d['max-inline-size'], sel).toBe('60ch')
      expect(d['inline-size'] ?? '100%', sel).toBe('100%')
    }
  })

  it('the stepper NumberField at xs uses the stepper token for the control, and the unit one when it has a suffix', () => {
    expect(declarations(field, ".ui-field--stepper[data-size='xs']")['--field-control-max']).toBe('var(--field-size-xs-stepper)')
    expect(declarations(field, ".ui-field--stepper[data-size='xs']:has(.ui-field__suffix)")['--field-control-max']).toBe('var(--field-size-xs-stepper-unit)')
  })

  it('the sm stepper NumberField has its own token, wide enough for value + unit', () => {
    expect(all).toMatch(/--field-size-sm-stepper\s*:\s*192px\s*;/)
    expect(declarations(field, ".ui-field--stepper[data-size='sm']")['--field-control-max']).toBe('var(--field-size-sm-stepper)')
  })

  it('SearchField (no helper, no error) keeps the same max-inline-size rules with the same tokens', () => {
    for (const size of ['xs', 'sm', 'md', 'lg']) {
      expect(declarations(search + field, `.search-field[data-size='${size}']`)['max-inline-size'], size).toBe(size === 'md' ? 'min(var(--field-size-md), 100%)' : `var(--field-size-${size})`)
    }
    expect(declarations(search + field, ".search-field[data-size='full']")['max-inline-size']).toBe('100%')
  })

  it('uses no raw px cap in a data-size rule (tokens only)', () => {
    for (const size of ['xs', 'sm', 'md', 'lg', 'full']) {
      expect(declarations(field, `.ui-field[data-size='${size}']`)['--field-control-max']).not.toMatch(/^\d+px$/)
    }
  })
})
