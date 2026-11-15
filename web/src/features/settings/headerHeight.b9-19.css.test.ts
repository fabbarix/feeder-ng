// B9-19 review: every page's header sits at the same height. The Settings screens (the hub and every settings page) wrap their
// PageHeader in .settings, which once added a 16 px top padding of its own and pushed the header lower than on other pages.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/settings/settings.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('B9-19: the Settings header sits at the same height as every page header', () => {
  it('.settings adds no top padding above its PageHeader', () => {
    const body = /(^|\})\s*\.settings\s*\{([^}]*)\}/.exec(css)?.[2] ?? ''
    expect(body).toMatch(/display:\s*grid/)
    expect(body).not.toMatch(/padding(-top|-block|-block-start)?\s*:/)
  })
})
