// R2-4 L-10: board.css is 2 columns by default and becomes the 4 x 3 wall grid from 600 px.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8')

const at = css.indexOf('@media (min-width: 600px)')
const base = at < 0 ? css : css.slice(0, at)
const wall = at < 0 ? '' : css.slice(at)
const rule = (text: string, selector: string) => {
  const start = text.indexOf(`${selector} {`)
  return start < 0 ? '' : text.slice(start, text.indexOf('}', start) + 1).replace(/\s+/g, ' ')
}

describe('board.css phone grid', () => {
  it('has a 600 px block', () => {
    expect(at).toBeGreaterThan(-1)
  })
  it('the default grid is 2 columns with content-height rows', () => {
    const r = rule(base, '.board-screen .bento-grid')
    expect(r).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(r).not.toMatch(/height:\s*calc\(100vh/)
    expect(r).not.toMatch(/grid-template-rows:\s*repeat\(3/)
  })
  it('from 600 px it is the 4 x 3 grid at screen height', () => {
    const r = rule(wall, '  .board-screen .bento-grid')
    expect(r).toMatch(/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
    expect(r).toMatch(/grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(r).toMatch(/height:\s*calc\(100vh - 48px\)/)
  })
  it('a phone tile has a readable minimum height (the clock does not clip)', () => {
    expect(rule(base, '.board-cell')).toMatch(/min-height:\s*\d+(\.\d+)?rem/)
  })
})
