// CSS contract of the Scan sheets (WP7). vitest blanks CSS imports, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/scan/scan.css`, 'utf8')

describe('scan.css', () => {
  it('the sheet form stacks its fields with a token gap (ManualBarcodeEntry)', () => {
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

// SR4 review: the "just scanned" wash (shop-scan-proposals.md 13.3).
describe('scan.css: the just-scanned wash', () => {
  it('washes in the success background token, and plays twice-named so a rescan restarts it', () => {
    for (const pulse of ['a', 'b']) expect(declarations(css, `.list-row[data-fresh='${pulse}']`)['animation']).toMatch(new RegExp(`scanned-row-wash-${pulse} .*var\\(--`))
    expect(css).toMatch(/@keyframes scanned-row-wash-a\s*\{\s*from\s*\{\s*background: var\(--status-success-bg\)/)
  })

  it('is off with reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.list-row\[data-fresh\]\s*\{\s*animation: none/)
  })
})

// beta.7 polish: beside the "Add price" pill a long "x of y" wraps to a second line instead of being cut.
describe('scan.css: the cover line beside "Add price"', () => {
  it('lets the meta line wrap on a row marked data-meta-wrap, the tick and its text together', () => {
    const meta = declarations(css, ".list-row[data-meta-wrap='true'] .list-row__meta")
    expect(meta['white-space']).toBe('normal')
    expect(meta['overflow']).toBe('visible')
    expect(declarations(css, ".list-row[data-meta-wrap='true'] .scanned-row__meta")['flex-wrap']).toBe('wrap')
    expect(declarations(css, '.scanned-row__cover')['display']).toBe('inline-flex')
  })
})

// beta.7 polish: the docked Price entry keeps Close and Save in the window (desktop, no-camera message, per kg).
describe('scan.css: the docked keypad\'s actions stay in view', () => {
  const docked = (css.match(/@media \(min-width: 768px\) \{\s*\.scan-screen__camera \.sheet[\s\S]*?\n\}/) ?? [''])[0]
  it('sticks the actions to the bottom of the window, on the surface', () => {
    expect(docked).toMatch(/\.scan-screen__camera \.price-keypad__actions \{[^}]*position: sticky;[^}]*inset-block-end: 0;[^}]*background: var\(--color-surface\);/)
  })
  it('lets the docked sheet clip instead of scroll, so the window is what they stick to', () => {
    expect(docked).toMatch(/\.sheet\[data-modal='false'\] \{\s*overflow: clip;/)
    expect(docked).toMatch(/\.sheet__panel \{\s*max-height: none;/)
    expect(docked).toMatch(/\.sheet__body \{\s*overflow: visible;/)
  })
})
