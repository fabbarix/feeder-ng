// L9: the web app manifest (built by VitePWA from vite.config.ts) carries the brand icon, with the light page colours.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const config = readFileSync(`${cwd}/vite.config.ts`, 'utf8')

describe('PWA manifest config', () => {
  it('has an "any" SVG icon from the existing favicon', () => {
    expect(config).toMatch(/icons:\s*\[\{[^\]]*src:\s*'\/favicon\.svg'[^\]]*sizes:\s*'any'[^\]]*type:\s*'image\/svg\+xml'[^\]]*purpose:\s*'any'/)
  })
  it('uses the page theme-color, not the old dark #1d1b20', () => {
    expect(config).toContain("theme_color: '#e7f4eb'")
    expect(config).not.toContain('#1d1b20')
  })
})
