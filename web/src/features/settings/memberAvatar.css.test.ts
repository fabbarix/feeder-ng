// CSS contract of Member colour on Avatars (WP11 review). The initials keep AA contrast because the Member colour
// is only the 2 px ring (the Avatar primitive's `colour` prop, data-coloured); the fill and initial colour stay the
// primitive's own tokens. Repainting the fill with a tint made white initials 1.34:1.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

const css = readFileSync(`${cwd}/src/features/settings/settings.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('settings.css: Member colour never repaints the Avatar fill', () => {
  it('no rule targets .avatar (the primitive owns its fill and initials colour), except the neutral not-eating pill of DS-11', () => {
    // DS-11 (B9-10): a Member who does not eat the Course is an outlined pill whose avatar is surface-2 with a muted letter: neutral
    // tokens, never a tint of the Member colour, so the initials keep their contrast (the reason for this test).
    const rest = css.replace(/\.course-eaters__pill\[aria-pressed='false'\] \.avatar\s*\{([^}]*)\}/g, (_m, body: string) => {
      expect(body).not.toMatch(/--member-colour/)
      expect(body).toMatch(/background:\s*var\(--color-surface-2\)/)
      return ''
    })
    expect(rest).not.toMatch(/\.avatar\b/)
  })

  it('no colour tint of a Member colour is used as a background (color-mix with --member-colour)', () => {
    expect(css).not.toMatch(/background[^;]*color-mix[^;]*--member-colour/)
  })

  it('if a .member-avatar rule exists it sets no background or text colour', () => {
    for (const m of css.matchAll(/\.member-avatar[^{,]*\{([^}]*)\}/g)) {
      expect(m[1]).not.toMatch(/(^|;|\s)(background|background-color|color)\s*:/)
    }
  })
})
