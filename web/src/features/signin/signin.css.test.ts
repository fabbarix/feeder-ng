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

  it('SignInPage and EmailNotVerifiedPage render the mark inside the hero Tile (same .signin__tile)', () => {
    const sources = ['SignInPage', 'EmailNotVerifiedPage'].map((n) => readFileSync(`${cwd}/src/features/signin/components/${n}.tsx`, 'utf8'))
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

// QA-3 (dark mode): the sign-in and waiting pages must show the app's background token in both themes, never a different
// dark. The page paints --color-background itself (the same token as body), so what sits behind the hero Tile does not
// depend on what paints html or body; the boot paint and the theme-color metas carry the same Basil values as the tokens.
const styles = readFileSync(`${cwd}/src/styles.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const indexHtml = readFileSync(`${cwd}/index.html`, 'utf8')

describe('signin.css: the page uses the app background token in light and dark', () => {
  it('.signin paints var(--color-background) (not a literal, not the surface tokens)', () => {
    expect(declarations(css, '.signin')['background']).toBe('var(--color-background)')
  })

  it('body paints the same token', () => {
    expect(styles).toMatch(/body\s*\{[^}]*background:\s*var\(--color-background\)/)
  })

  it('--color-background is --color-bg, and every dark block sets --color-bg to the dark Basil ground (#090f0b)', () => {
    expect(styles).toContain('--color-background: var(--color-bg)')
    const dark = [...styles.matchAll(/(?:\[data-scheme='dark'\]|:root:not\(\[data-scheme='light'\]\))\s*\{([^}]*)\}/g)]
    expect(dark.length).toBeGreaterThanOrEqual(2)
    for (const m of dark) expect(m[1]).toMatch(/--color-bg:\s*#090f0b;/)
  })

  it('the boot background in index.html and its dark theme-color equal the tokens', () => {
    expect(indexHtml).toMatch(/html\s*\{\s*background:\s*#e7f4eb;\s*\}/)
    expect(indexHtml).toMatch(/data-scheme='light'\]\)\s*\{\s*background:\s*#090f0b;/)
    expect(indexHtml).toMatch(/data-scheme='dark'\]\s*\{\s*background:\s*#090f0b;/)
    expect(indexHtml).toMatch(/prefers-color-scheme: dark\)"\s+content="#090f0b"/)
  })

  it('the waiting page uses the same .signin page (no second background rule in access.css)', () => {
    const access = readFileSync(`${cwd}/src/features/access/access.css`, 'utf8')
    expect(access).not.toMatch(/\.signin\b[^{]*\{[^}]*background/)
  })
})
