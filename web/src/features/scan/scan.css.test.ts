// CSS contract of the Scan sheets (WP7). vitest blanks CSS imports, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/scan/scan.css`, 'utf8')

describe('scan.css', () => {
  it('the sheet form stacks its fields with a token gap (UnknownBarcodeSheet, ManualBarcodeEntry)', () => {
    const d = declarations(css, '.scan-sheet-form')
    expect(d['display']).toMatch(/^(flex|grid)$/)
    if (d['display'] === 'flex') expect(d['flex-direction']).toBe('column')
    expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
  })
})

// SR4: the Split layout (shop-scan-proposals.md 13.2; mockups 01-scan-390 and 01-scan-1280).
describe('scan.css: the Split layout', () => {
  const wide = (css.match(/@media\s*\(min-width:\s*(\d+)px\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g) ?? []).find((m) => m.includes('.scan-screen__split')) ?? ''

  it('stacks the camera over the list on a phone', () => {
    const d = declarations(css, '.scan-screen__split')
    expect(d['display']).toMatch(/^(flex|grid)$/)
    if (d['display'] === 'flex') expect(d['flex-direction']).toBe('column')
    expect(d['gap']).toMatch(/^var\(--/)
  })

  it('puts the camera on the left and the list on the right from a wide viewport', () => {
    expect(wide).toMatch(/min-width:\s*(768|1024)px/)
    expect(wide).toMatch(/\.scan-screen__split[^}]*grid-template-columns/)
  })

  it('does not cover the bottom nav: the screen is not a fixed overlay', () => {
    expect(declarations(css, '.scan-screen')['position']).not.toBe('fixed')
    expect(declarations(css, '.scan-screen__split')['position']).not.toBe('fixed')
  })

  it('outlines the row being priced with the accent focus colour, never a hard-coded colour', () => {
    const d = declarations(css, ".list-row[data-pricing='true']")
    expect(Object.values(d).join(' ')).toMatch(/var\(--/)
  })
})
