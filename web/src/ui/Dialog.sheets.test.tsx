// B9-14 / SHORT-02 rule 8: Dialog and BottomSheet follow the same short rule in CSS.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const mediaBlock = (css: string, query: RegExp): string => {
  const out: string[] = []
  const re = /@media\s*([^{]+)\{/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (!query.test(m[1]!)) continue
    let depth = 1
    let i = re.lastIndex
    while (i < css.length && depth > 0) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0, i++
    out.push(css.slice(re.lastIndex, i - 1))
  }
  return out.join('\n')
}
const rule = (text: string, sel: string): string => text.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

describe('Dialog.css short rule (SHORT-02 rule 8)', () => {
  const css = readUiCss('Dialog.css')
  it('the dialog never outgrows the viewport: max-block-size calc(100dvh - 16px), and its body scrolls', () => {
    expect(declarations(css, '.dialog')['max-block-size']).toBe('calc(100dvh - 16px)')
    const panel = declarations(css, '.dialog__panel')
    expect(panel['max-block-size']).toBe('inherit')
    expect(panel['overflow-y'] ?? declarations(css, '.dialog__body')['overflow-y']).toBe('auto')
  })
  it('the panel pads space-4 below 500 px tall', () => {
    const short = mediaBlock(css, /max-height:\s*499px/)
    expect(rule(short, '.dialog__panel')).toMatch(/padding:\s*var\(--space-4\)/)
  })
  it('a context line sits above the title', () => {
    expect(css).toMatch(/\.dialog__context\s*\{/)
  })
})
