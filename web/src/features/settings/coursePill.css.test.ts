// CSS contract (CRS D2 review, A11Y-02 in B9-10): the Who-eats-it pills show the one global focus ring (the :focus-visible outline,
// which follows the pill's radius). They had their own `box-shadow: var(--focus-ring)`; A11Y-02 removes feature rings and the
// `--focus-ring` token, so the pill draws none of its own and never hides the outline.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/settings/settings.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('settings.css: .course-eaters__pill focus ring', () => {
  const pillRules = [...css.matchAll(/([^{}]*\.course-eaters__pill[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]!)

  it('has no :focus-visible rule of its own (the global ring draws it)', () => {
    expect(css).not.toMatch(/\.course-eaters__pill:focus-visible/)
  })

  it('never hides the outline and never draws a --focus-ring box-shadow', () => {
    for (const body of pillRules) {
      expect(body).not.toMatch(/outline\s*:\s*(none|0)\b/)
      expect(body).not.toMatch(/--focus-ring\b/)
    }
  })

  it('keeps the pill radius, so the outline follows the pill', () => {
    expect(css).toMatch(/\.course-eaters__pill\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/)
  })
})
