// SF1 defect 1: at 360 px the Pantry title broke as "Pant / ry" (overflow-wrap: anywhere beside two actions).
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('PageHeader.css')

describe('PageHeader.css, titles break between words (SF1)', () => {
  it('the title wraps at word boundaries only (DS-A system.md §10: no anywhere, no break-word, no hyphens)', () => {
    const d = declarations(css, '.page-header__title')
    expect(d['overflow-wrap'] ?? 'normal').toBe('normal')
    expect(d['word-break'] ?? 'normal').toBe('normal')
    expect(d['hyphens'] ?? 'manual').toBe('manual')
  })

  it('the row wraps, so the actions drop below a title that cannot keep a readable width', () => {
    expect(declarations(css, '.page-header__row')['flex-wrap']).toBe('wrap')
  })

  it('RX-03: the text keeps a basis of 8rem (was 12rem), so "Recipes", New Recipe and the menu share one row from 375 px', () => {
    const d = declarations(css, '.page-header__text')
    expect(d['flex']).toBe('1 1 8rem')
    expect(d['min-inline-size']).toBe('0')
  })

  it('DS-03: the actions never reach past the gutter: they wrap, stay at the inline end, and may shrink to the column', () => {
    const d = declarations(css, '.page-header__actions')
    expect(d['flex-wrap']).toBe('wrap')
    expect(d['justify-content']).toBe('flex-end')
    expect(d['min-inline-size']).toBe('0')
    expect(d['max-inline-size']).toBe('100%')
  })

  it('wrapped actions stay at the inline end', () => {
    expect(declarations(css, '.page-header__actions')['margin-inline-start']).toBe('auto')
  })
})
