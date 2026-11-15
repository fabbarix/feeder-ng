// B9-45 (PC-02; B9-STATE follow-up): the notice text never breaks mid-word, and the notice is info-toned, not spoil.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (p: string) => readFileSync(`${cwd}/src/features/${p}`, 'utf8')
const notice = read('stock/components/ShortfallNotice.css')
const stock = read('stock/stock.css')

const rules = (css: string, selector: RegExp) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => selector.test(m[1]!)).map((m) => m[2]!)

describe('ShortfallNotice.css', () => {
  it('has rules for the notice (it is not an empty file)', () => {
    expect(rules(notice, /\.shortfall-notice/).length).toBeGreaterThan(0)
  })
  it('never breaks a word: no overflow-wrap anywhere or break-word, no word-break, no hyphenation', () => {
    for (const body of rules(notice, /\.shortfall-notice/)) {
      expect(body).not.toMatch(/overflow-wrap:\s*(anywhere|break-word)/)
      expect(body).not.toMatch(/word-break:\s*(break-all|break-word)/)
      expect(body).not.toMatch(/hyphens:\s*auto/)
    }
  })
  it('wraps the two buttons as whole buttons (flex-wrap) rather than cutting their labels', () => {
    const actions = rules(notice, /\.shortfall-notice__actions/).join('\n')
    expect(actions).toMatch(/flex-wrap:\s*wrap/)
  })
  it('uses no spoil or danger colour (the notice is info)', () => {
    expect(notice).not.toMatch(/spoil|danger/)
  })
})

describe('stock.css no longer carries the old notice rules', () => {
  it('has no .shortfall-notice__text rule (the one with overflow-wrap: anywhere) or spoil notice styling', () => {
    expect(stock).not.toMatch(/\.shortfall-notice__text/)
    expect(stock).not.toMatch(/\.shortfall-notice[^{]*\{[^}]*overflow-wrap:\s*anywhere/)
  })
})
