// CSS contract (CRS D2 review): the Who-eats-it pills show the focus ring as a box-shadow. `--focus-ring` is a box-shadow
// value, so `outline: 2px solid var(--focus-ring)` is invalid and draws nothing.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/settings/settings.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('settings.css: .course-eaters__pill focus ring', () => {
  const rule = /\.course-eaters__pill:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''

  it('has a :focus-visible rule', () => {
    expect(rule).not.toBe('')
  })

  it('uses box-shadow: var(--focus-ring)', () => {
    expect(rule).toMatch(/box-shadow\s*:\s*var\(--focus-ring\)/)
  })

  it('does not feed --focus-ring to an outline', () => {
    expect(rule).not.toMatch(/outline[^;]*--focus-ring/)
  })
})
