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
})
