// SF1 defect 1: at 360 px the Pantry title broke as "Pant / ry" (overflow-wrap: anywhere beside two actions).
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('PageHeader.css')

describe('PageHeader.css, titles break between words (SF1)', () => {
  it('the title never breaks inside a word unless that one word cannot fit: break-word, not anywhere', () => {
    const d = declarations(css, '.page-header__title')
    expect(d['overflow-wrap']).toBe('break-word')
    expect(d['word-break'] ?? 'normal').not.toBe('break-all')
  })

  it('the row wraps, so the actions drop below a title that cannot keep a readable width', () => {
    expect(declarations(css, '.page-header__row')['flex-wrap']).toBe('wrap')
  })

  it('the text keeps a basis of at least 8rem to 16rem (it shrinks no further than that beside the actions)', () => {
    const d = declarations(css, '.page-header__text')
    expect(`${d['flex'] ?? ''} ${d['flex-basis'] ?? ''}`).toMatch(/\b(([89]|1[0-6])(\.\d+)?rem)\b/)
    expect(d['min-inline-size']).toBe('0')
  })

  it('wrapped actions stay at the inline end', () => {
    expect(declarations(css, '.page-header__actions')['margin-inline-start']).toBe('auto')
  })
})
