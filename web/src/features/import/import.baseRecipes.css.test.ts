// CSS contract of the Base recipe tiles (BR-E, design §2, §6, §11.3): tokens only, status tiles bordered in their tone, chips on one line.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/import/import.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}
const baseClasses = [
  'base-line-tile',
  'base-line-tile__reading',
  'base-line-tile__question',
  'base-line-tile__chips',
  'base-line-tile__problem',
  'base-line-tile__note',
  'base-line-tile__actions',
  'base-answers',
  'base-answers__choice',
  'base-take-over',
  'base-take-over__text',
  'base-yield',
  'import-confirm-problem',
  'import-follow-ups',
  'export-picker__also',
]

describe('import.css, Base recipe tiles', () => {
  it('every class the Base recipe tiles use has a rule of its own', () => {
    for (const name of baseClasses) expect(css, name).toMatch(new RegExp(`\\.${name} \\{`))
  })

  it('uses design tokens only: no colour literal and no raw size in the Base recipe rules', () => {
    const start = css.indexOf('/* ---- Base recipes (BR-E')
    const block = css.slice(start)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/\b(rgba?|hsla?|oklch)\(/)
    expect(block).not.toMatch(/font-size:\s*(?!var\(--text-)/)
  })

  it('a danger status tile (a Problem) has a 1 px border in the danger tone', () => {
    expect(rule('.base-line-tile__problem')).toMatch(/border:\s*1px solid var\(--status-danger-fg\)/)
    expect(rule('.import-confirm-problem')).toMatch(/border:\s*1px solid var\(--status-danger-fg\)/)
  })

  it('the take-over ask (an open question) has a 1 px border in the info tone', () => {
    expect(rule('.base-take-over')).toMatch(/border:\s*1px solid var\(--color-info-fg\)/)
  })

  it('the chips of a line stay on one line: no wrap, the label ends in an ellipsis-sized track', () => {
    expect(rule('.base-line-tile__chips')).toMatch(/flex-wrap:\s*nowrap/)
    const chip = rule('.base-line-tile__chips .chip')
    expect(chip).toMatch(/white-space:\s*nowrap/)
    expect(chip).toMatch(/min-inline-size:\s*0/)
  })

  it('a tile is not accent-coloured at rest: the answers and the reading use text and muted tokens only', () => {
    const block = css.slice(css.indexOf('/* ---- Base recipes (BR-E'))
    expect(block).not.toMatch(/--color-accent\b/)
  })
})
