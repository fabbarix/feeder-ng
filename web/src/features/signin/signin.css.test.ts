// CSS contract of the sign-in screens (WP11 review): the Feeder mark sits on the hero Tile (--color-accent fill,
// --color-on-accent text), so it must be drawn in the hero's text colour, never in --color-primary/--color-accent
// (invisible on that fill). vitest blanks CSS imports, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

const css = readFileSync(`${cwd}/src/features/signin/signin.css`, 'utf8')
const mark = readFileSync(`${cwd}/src/features/signin/components/FeederMark.tsx`, 'utf8')

describe('signin.css: the Feeder mark is visible on the hero Tile', () => {
  it('FeederMark draws with currentColor only (no literal or token fills)', () => {
    expect(mark).toContain('currentColor')
    expect(mark).not.toMatch(/(fill|stroke)="(?!none|currentColor)/)
  })

  it('.signin__mark does not paint itself in the primary or accent colour (the hero fill)', () => {
    let d: Record<string, string> = {}
    try {
      d = declarations(css, '.signin__mark')
    } catch {
      /* no rule at all inherits on-accent from the hero: fine */
    }
    const colour = d['color']
    if (colour !== undefined) {
      expect(['inherit', 'currentColor', 'var(--color-on-accent)', 'var(--color-on-primary)']).toContain(colour)
    }
    expect(d['fill'] ?? 'currentColor').toBe('currentColor')
  })

  it('SignInPage and NotInvitedPage render the mark inside the hero Tile (same .signin__tile)', () => {
    const sources = ['SignInPage', 'NotInvitedPage'].map((n) => readFileSync(`${cwd}/src/features/signin/components/${n}.tsx`, 'utf8'))
    for (const src of sources) {
      expect(src).toContain('<FeederMark')
      expect(src).toMatch(/variant="hero"/)
    }
  })

  it('the alert on the hero sets its own text colour (it has a light fill, so it must not inherit on-accent)', () => {
    const d = declarations(css, '.signin__alert')
    expect(d['color']).toMatch(/^var\(--color-(text|on-surface)\)$/)
  })

  it('uses tokens only (no hex colours)', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
