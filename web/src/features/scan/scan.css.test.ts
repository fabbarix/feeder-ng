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
