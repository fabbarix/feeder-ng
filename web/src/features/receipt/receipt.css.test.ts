// b8-rxweb: the receipt pages' spacing (docs/dev/design/b8-rxweb.md 3). vitest blanks CSS imports, so the stylesheet is read from disk.
// 1. The page header and the first section ("PHOTOS (n)") are a --section-gap apart (system.md 8), as sections are.
// 2. On a short page the sticky "Read the receipt" / "Apply" bar sits at the foot of the viewport, not right after the content:
//    the receipt Page (the one whose header is .receipt-page-header) is a column at least one viewport tall, its body fills it and the bar
//    takes the free space above itself. Tokens only, no px or rem gaps.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/receipt/receipt.css`, 'utf8')

describe('receipt.css: header and sections', () => {
  it('the header is a section gap above the first section', () => {
    expect(declarations(css, '.receipt-page-header')['margin-block-end']).toBe('var(--section-gap)')
  })
})

describe('receipt.css: a short page keeps its sticky bar at the foot', () => {
  it('the Page is a column at least one viewport tall', () => {
    const d = declarations(css, '.page:has(.receipt-page-header)')
    expect(d['display']).toBe('flex')
    expect(d['flex-direction']).toBe('column')
    expect(d['min-block-size']).toBe('100dvh')
    expect(d['box-sizing']).toBe('border-box')
  })
  it('its body fills the rest, still a column spaced by the section gap', () => {
    const d = declarations(css, '.page:has(.receipt-page-header) > .page__body')
    expect(d['display']).toBe('flex')
    expect(d['flex-direction']).toBe('column')
    expect(d['flex']).toMatch(/^1\b/)
    expect(d['gap']).toBe('var(--section-gap)')
  })
  it('the sticky bar takes the free space above itself', () => {
    expect(declarations(css, '.page:has(.receipt-page-header) .sticky-action-bar')['margin-block-start']).toBe('auto')
  })
  it('uses no px or rem lengths for any of it', () => {
    const block = css.slice(css.indexOf('.receipt-page-header'))
    const rules = (block.match(/\.receipt-page-header[^{]*\{[^}]*\}|\.page:has\(\.receipt-page-header\)[^{]*\{[^}]*\}/g) ?? []).join('\n')
    expect(rules).not.toMatch(/\d(px|rem)\b/)
  })
})
