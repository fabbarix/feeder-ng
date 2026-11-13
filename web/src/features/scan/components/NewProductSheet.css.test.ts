// SR5: the sheet has its own stylesheet (scan.css belongs to SR4) and it uses tokens. vitest blanks CSS imports, so the file is read from disk.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/scan/components/NewProductSheet.css`, 'utf8')

describe('NewProductSheet.css', () => {
  it('stacks the sheet\'s steps with a token gap', () => {
    const d = declarations(css, '.new-product__form')
    expect(d['display']).toMatch(/^(flex|grid)$/)
    if (d['display'] === 'flex') expect(d['flex-direction']).toBe('column')
    expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
  })

  it('lays the Line chips and the pack chips out in a wrapping row with a token gap', () => {
    for (const selector of ['.new-product__chips']) {
      const d = declarations(css, selector)
      expect(d['display']).toBe('flex')
      expect(d['flex-wrap']).toBe('wrap')
      expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
    }
  })

  it('has no raw colours: colours come from tokens', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('draws the Picture preview 4:3, with a token radius', () => {
    const d = declarations(css, '.new-product__preview')
    expect(d['aspect-ratio']).toMatch(/^4\s*\/\s*3$/)
    expect(d['border-radius']).toMatch(/^var\(--radius/)
  })

  it('does not rely on the hidden file input for layout (it stays [hidden])', () => {
    expect(css).not.toMatch(/input\[type=['"]?file/)
  })
})
