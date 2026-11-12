// L12: secondary text uses the contrast-guarded --color-muted token as it is; an opacity on top pushed it to 4.39:1.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/notifications/notifications.css`, 'utf8')

describe('notifications.css', () => {
  it('does not fade the muted text', () => {
    const body = /\.notifications__muted\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(body).toContain('var(--color-muted')
    expect(body).not.toMatch(/opacity/)
  })

  // QA-2: the shared page (ListPage, and the shell's page container) owns padding and width; the screen adds none.
  it('has no screen root rule: no .notifications block with max-width, padding or margin', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of bare.matchAll(/(^|\})\s*([^{}@]+)\{([^{}]*)\}/g)) {
      const selectors = m[2]!.split(',').map((x) => x.trim())
      if (!selectors.includes('.notifications')) continue
      expect(m[3], '.notifications').not.toMatch(/max-width|max-inline-size|padding|margin/)
    }
    expect(bare).not.toMatch(/\.notifications\s*\{[^}]*(max-width|padding)/)
  })
})
