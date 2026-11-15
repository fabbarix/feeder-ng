// B9-19 (SHORT-05): the page extends under the notch (viewport-fit=cover), and the insets are then the page's to honour. Boot is B9-49's;
// this package only keeps viewport-fit=cover (the plan's trap: index.html gets nothing else here).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

describe('index.html viewport meta', () => {
  const html = readFileSync(`${cwd}/index.html`, 'utf8')
  const meta = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''

  it('is device-width with viewport-fit=cover', () => {
    expect(meta).toContain('width=device-width')
    expect(meta).toContain('viewport-fit=cover')
  })

  it('does not stop the user zooming (WCAG 1.4.4, and the 400 % zoom scenario)', () => {
    expect(meta).not.toMatch(/user-scalable\s*=\s*(no|0)/)
    expect(meta).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/)
  })
})
