// L9, LG: the web app manifest (built by VitePWA from vite.config.ts) carries the Family Pot icons ("any" and "maskable"), with the light page colours.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const config = readFileSync(`${cwd}/vite.config.ts`, 'utf8')

describe('PWA manifest config', () => {
  const entry = (src: string) => config.match(new RegExp(`\\{[^{}]*src:\\s*'${src.replace(/[.\/]/g, '\\$&')}'[^{}]*\\}`))?.[0] ?? ''
  const cases: Array<[string, string, string, string]> = [
    ['/icon-192.png', '192x192', 'image/png', 'any'],
    ['/icon-512.png', '512x512', 'image/png', 'any'],
    ['/icon-maskable-192.png', '192x192', 'image/png', 'maskable'],
    ['/icon-maskable-512.png', '512x512', 'image/png', 'maskable'],
    ['/favicon.svg', 'any', 'image/svg+xml', 'any'],
  ]
  it.each(cases)('has the %s icon (%s, %s, purpose %s)', (src, sizes, type, purpose) => {
    const e = entry(src)
    expect(e).not.toBe('')
    expect(e).toContain(`sizes: '${sizes}'`)
    expect(e).toContain(`type: '${type}'`)
    expect(e).toContain(`purpose: '${purpose}'`)
  })
  it('no icon asks for "any maskable" together', () => {
    expect(config).not.toMatch(/purpose:\s*'any maskable'/)
  })
  it('uses the page theme-color, not the old dark #1d1b20', () => {
    expect(config).toContain("theme_color: '#e7f4eb'")
    expect(config).toContain("background_color: '#e7f4eb'")
    expect(config).not.toContain('#1d1b20')
  })
  it('precaches the icon files (png and ico) as well as svg', () => {
    const glob = config.match(/globPatterns:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(glob).toMatch(/png/)
    expect(glob).toMatch(/ico/)
    expect(glob).toMatch(/svg/)
  })
})
