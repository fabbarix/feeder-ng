// LG: the shipped icon files exist, at the sizes the manifest and head claim, and the old icons are gone.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const fs = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string) => Uint8Array & { readUInt32BE: (o: number) => number; readUInt16LE: (o: number) => number; readUInt8: (o: number) => number; toString: (e: string) => string }
  existsSync: (p: string) => boolean
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // web/
const pub = (n: string) => `${cwd}/public/${n}`
const brand = (n: string) => `${cwd}/../docs/brand/${n}`

function png(path: string) {
  const b = fs.readFileSync(path)
  expect(b.toString('latin1').startsWith('\x89PNG')).toBe(true)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b.readUInt8(25) } // 6 = RGBA, 2 = RGB
}

describe('web/public icons', () => {
  const sizes: Array<[string, number, number?]> = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180, 2],
    ['icon-192.png', 192, 6],
    ['icon-512.png', 512, 6],
    ['icon-maskable-192.png', 192, 2],
    ['icon-maskable-512.png', 512, 2],
  ]
  it.each(sizes)('%s is %i px square (colour type %s: apple and maskable are opaque, "any" is transparent)', (name, size, ct) => {
    expect(fs.existsSync(pub(name))).toBe(true)
    const p = png(pub(name))
    expect([p.w, p.h]).toEqual([size, size])
    if (ct !== undefined) expect(p.colorType).toBe(ct)
  })

  it('favicon.ico holds 16, 32 and 48 px images', () => {
    const b = fs.readFileSync(pub('favicon.ico'))
    expect(b.readUInt16LE(2)).toBe(1) // type: icon
    const n = b.readUInt16LE(4)
    const dims = Array.from({ length: n }, (_, i) => b.readUInt8(6 + i * 16) || 256).sort((a, c) => a - c)
    expect(dims).toEqual([16, 32, 48])
  })

  it('safari-pinned-tab.svg is a single-colour SVG', () => {
    expect(fs.existsSync(pub('safari-pinned-tab.svg'))).toBe(true)
    expect(fs.readFileSync(pub('safari-pinned-tab.svg')).toString('utf8')).toMatch(/<svg[^>]+viewBox=/)
  })
})

describe('brand source files are kept under docs/brand', () => {
  it.each(['README.md', 'master/mark.svg', 'master/mark-dark.svg', 'master/mark-mono.svg', 'master/mark-small.svg', 'master/logo-horizontal.svg', 'master/logo-horizontal-dark.svg', 'master/logo-horizontal-mono.svg', 'ios/AppIcon-1024.svg', 'android/play-store-512.png', 'android/mipmap-anydpi-v26/ic_launcher.xml'])(
    '%s exists',
    (name) => expect(fs.existsSync(brand(name))).toBe(true),
  )
})

describe('the old icons are gone', () => {
  it('web/public has no two-circles favicon and no leftover icon outside the new set', () => {
    const svg = fs.readFileSync(pub('favicon.svg')).toString('utf8')
    expect(svg).not.toMatch(/<circle/)
    expect(svg).not.toContain('#2a7f62')
  })
  it('the boot paint in index.html no longer draws the old two-circle mark', () => {
    const html = fs.readFileSync(`${cwd}/index.html`).toString('utf8')
    expect(html).not.toContain('<circle cx="12" cy="12" r="8"/>')
  })
})
