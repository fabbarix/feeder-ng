// CSS contract of the Base recipe tiles (BR-E, design §2, §6, §11.3): tokens only, chips on one line, and the status tiles are shared Tiles
// (their 1 px border in the tone comes from the Tile, so the tiles here set none).
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/import/import.css').replace(/\/\*[\s\S]*?\*\//g, '')
const block = css.slice(css.indexOf('/* ---- Base recipes (BR-E'))
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}
const baseClasses = [
  'base-line-tile',
  'base-line-tile__reading',
  'base-line-tile__question',
  'base-line-tile__chips',
  'base-line-tile__note',
  'base-line-tile__actions',
  'base-take-over__text',
  'base-yield',
  'import-follow-ups',
  'export-picker__also',
]

describe('import.css, Base recipe tiles', () => {
  it('every class the Base recipe tiles use has a rule of its own', () => {
    for (const name of baseClasses) expect(css, name).toMatch(new RegExp(`\\.${name} \\{`))
  })

  it('the rules of the removed tiles are gone: the status tiles are shared Tiles', () => {
    for (const name of ['base-line-tile__problem', 'base-take-over', 'base-answers', 'import-confirm-problem']) {
      expect(css, name).not.toMatch(new RegExp(`\\.${name}\\b`))
    }
  })

  it('uses design tokens only: no colour literal and no raw size in the Base recipe rules', () => {
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/\b(rgba?|hsla?|oklch)\(/)
    expect(block).not.toMatch(/font-size:\s*(?!var\(--text-)/)
  })

  it('the Problem and take-over tiles are shared status Tiles, in their tone', async () => {
    const tiles = readSource('features/import/components/BaseRecipeLineTile.tsx') + readSource('features/import/components/TakeOverQuestion.tsx')
    expect(tiles).toMatch(/variant="status" status="danger" role="alert"/)
    expect(tiles).toMatch(/variant="status" status="info"/)
  })

  it('the chips of a line stay on one line: no wrap, the label ends in an ellipsis-sized track', () => {
    expect(rule('.base-line-tile__chips')).toMatch(/flex-wrap:\s*nowrap/)
    const chip = rule('.base-line-tile__chips .chip')
    expect(chip).toMatch(/white-space:\s*nowrap/)
    expect(chip).toMatch(/min-inline-size:\s*0/)
  })

  it('a tile is not accent-coloured at rest: the answers and the reading use text and muted tokens only', () => {
    expect(block).not.toMatch(/--color-accent\b/)
  })
})
