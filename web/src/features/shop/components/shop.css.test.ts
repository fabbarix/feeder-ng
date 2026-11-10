// CSS contract of the Shop feature (WP7). vitest blanks CSS imports, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

function css(): string {
  try {
    return readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8')
  } catch {
    return ''
  }
}

const px = (v: string | undefined) => (v && /^\d+(\.\d+)?px$/.test(v) ? Number(v.replace('px', '')) : 0)

describe('shop.css', () => {
  it('exists and uses tokens only (no hex colours)', () => {
    expect(css()).not.toBe('')
    expect(css()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('the tick control is at least 44 x 44 px (ui-fix-plan 5.5, key acceptance)', () => {
    const d = declarations(css(), '.line-tile__tick')
    const width = Math.max(px(d['min-width']), px(d['width']), px(d['min-inline-size']), px(d['inline-size']))
    const height = Math.max(px(d['min-height']), px(d['height']), px(d['min-block-size']), px(d['block-size']))
    expect(width).toBeGreaterThanOrEqual(44)
    expect(height).toBeGreaterThanOrEqual(44)
  })

  it('a ticked title is struck through and muted', () => {
    const d = declarations(css(), ".line-tile[data-state='ticked'] .line-tile__title")
    expect(d['text-decoration']).toContain('line-through')
  })

  it('a Line tile is at least 96 px high', () => {
    expect(px(declarations(css(), '.line-tile')['min-height'])).toBeGreaterThanOrEqual(96)
  })

  it('has no rule for the old unstyled pill', () => {
    expect(css()).not.toContain('line-tile__check')
  })
})
