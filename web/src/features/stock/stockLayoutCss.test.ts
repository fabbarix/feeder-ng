// R2-4 L-06: the CSS contract of the two-column Stock screen. vitest blanks CSS imports, so the file is read from disk.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/stock/stock.css`, 'utf8')

const at = css.indexOf('@media (min-width: 1280px)')
const phone = at < 0 ? css : css.slice(0, at)
const wide = at < 0 ? '' : css.slice(at)
const rule = (text: string, selector: string) => {
  const start = text.indexOf(`${selector} {`)
  return start < 0 ? '' : text.slice(start, text.indexOf('}', start) + 1).replace(/\s+/g, ' ')
}

describe('stock.css two-column layout', () => {
  it('has a 1280 px block', () => {
    expect(at).toBeGreaterThan(-1)
  })
  it('below 1280 the layout is one column (no template columns)', () => {
    expect(rule(phone, '.stock-screen__layout')).not.toMatch(/grid-template-columns/)
    expect(rule(phone, '.stock-screen__aside')).not.toMatch(/position:\s*sticky/)
  })
  it('from 1280 the layout is a 360 px aside plus the list', () => {
    expect(rule(wide, '  .stock-screen__layout')).toMatch(/grid-template-columns:\s*22\.5rem minmax\(0, 1fr\)/)
  })
  it('from 1280 the aside is sticky below the top bar and scrolls on its own if it is tall', () => {
    const r = rule(wide, '  .stock-screen__aside')
    expect(r).toMatch(/position:\s*sticky/)
    expect(r).toMatch(/inset-block-start:\s*var\(--/)
    expect(r).toMatch(/max-block-size:\s*calc\(100dvh/)
    expect(r).toMatch(/overflow-y:\s*auto/)
  })
  it('sets no max-width of its own: the Page owns the width', () => {
    expect(css).not.toMatch(/max-(inline-size|width)/)
  })
})
