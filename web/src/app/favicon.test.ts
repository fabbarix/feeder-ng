// R11a N10: the brand favicon is an SVG in web/public (copied to dist by Vite, embedded and served by the Go server),
// linked from index.html. There is no /favicon.ico: browsers use the <link>.
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

describe('favicon', () => {
  it('index.html links the SVG icon', () => {
    expect(read('index.html')).toMatch(/<link[^>]+rel="icon"[^>]+type="image\/svg\+xml"[^>]+href="\/favicon\.svg"|<link[^>]+href="\/favicon\.svg"[^>]+rel="icon"/)
  })

  it('web/public/favicon.svg is the Feeder mark: two concentric circles, as on the boot screen', () => {
    const svg = read('public/favicon.svg')
    expect(svg).toMatch(/^\s*<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toMatch(/viewBox="0 0 24 24"/)
    expect((svg.match(/<circle/g) ?? []).length).toBe(2)
    expect(svg).not.toMatch(/<script|href=|xlink/i)
  })
})
