// LG: the Family Pot favicon set. index.html links the icons; the files live in web/public (copied to dist by Vite,
// embedded and served by the Go server). Replaces the R11a N10 two-circles favicon and its "no /favicon.ico" decision.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const read = (rel: string) => {
  try {
    return readFileSync(`${cwd}/${rel}`, 'utf8')
  } catch {
    return ''
  }
}

const head = read('index.html')
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const links = [...head.matchAll(/<link\b[^>]*>/g)].map((m) => attrs(m[0]))
const metas = [...head.matchAll(/<meta\b[^>]*>/g)].map((m) => attrs(m[0]))

describe('index.html head: icons', () => {
  it('links the 48px .ico, the SVG icon and the 32/16 PNGs as rel="icon"', () => {
    const icons = links.filter((l) => l.rel === 'icon')
    expect(icons).toContainEqual(expect.objectContaining({ href: '/favicon.ico', sizes: '48x48' }))
    expect(icons).toContainEqual(expect.objectContaining({ href: '/favicon.svg', type: 'image/svg+xml' }))
    expect(icons).toContainEqual(expect.objectContaining({ href: '/favicon-32.png', type: 'image/png', sizes: '32x32' }))
    expect(icons).toContainEqual(expect.objectContaining({ href: '/favicon-16.png', type: 'image/png', sizes: '16x16' }))
  })
  it('links the apple-touch-icon and the Safari mask-icon (basil); the manifest link is added by VitePWA, not written here', () => {
    expect(links).toContainEqual(expect.objectContaining({ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }))
    expect(links).toContainEqual(expect.objectContaining({ rel: 'mask-icon', href: '/safari-pinned-tab.svg', color: '#34724e' }))
    // VitePWA injects <link rel="manifest"> at build time; a hand-written one would make two (scripts/test/precache_test.sh checks dist).
    expect(links.filter((l) => l.rel === 'manifest')).toHaveLength(0)
  })
  it('keeps theme-color for light and dark', () => {
    const tc = metas.filter((m) => m.name === 'theme-color')
    expect(tc).toContainEqual(expect.objectContaining({ content: '#e7f4eb', media: '(prefers-color-scheme: light)' }))
    expect(tc).toContainEqual(expect.objectContaining({ content: '#090f0b', media: '(prefers-color-scheme: dark)' }))
  })
})

describe('favicon.svg', () => {
  it('is the Family Pot (a #symbol group, a dark variant), not the old two circles', () => {
    const svg = read('public/favicon.svg')
    expect(svg).toMatch(/^\s*<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toContain('id="symbol"')
    expect(svg).toContain('prefers-color-scheme')
    expect(svg).not.toMatch(/<circle/)
    expect(svg).not.toMatch(/<script|href=|xlink/i)
  })
})
