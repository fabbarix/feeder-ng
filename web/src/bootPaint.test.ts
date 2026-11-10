// Boot paint: before React mounts, index.html must already show the page background in the right scheme (no white flash in dark).
import { describe, expect, it } from 'vitest'
import { readStylesCss } from './ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const html = readFileSync(`${cwd}/index.html`, 'utf8')

const styles = readStylesCss()
const lightBg = /--color-bg:\s*(#[0-9a-f]{6})/i.exec(styles)?.[1]?.toLowerCase()
const darkBg = /\[data-scheme='dark'\][^{}]*\{[^}]*--color-bg:\s*(#[0-9a-f]{6})/i.exec(styles)?.[1]?.toLowerCase()
const inlineStyle = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html)?.[1] ?? ''

describe('web/index.html boot paint', () => {
  it('the token source of truth is readable (guards the test itself)', () => {
    expect(lightBg).toMatch(/^#[0-9a-f]{6}$/)
    expect(darkBg).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('declares both colour schemes to the browser', () => {
    expect(html).toMatch(/<meta\s+name="color-scheme"\s+content="light dark"/)
  })

  it('has an inline <style> painting html with the light --color-bg and, under prefers-color-scheme: dark, the dark one', () => {
    expect(inlineStyle.toLowerCase()).toContain(lightBg)
    expect(inlineStyle.toLowerCase()).toContain(darkBg)
    expect(inlineStyle).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/)
    expect(inlineStyle).toMatch(/html[^{}]*\{[^}]*background(-color)?:/)
  })

  it('honours an explicit data-scheme set before first paint as well as the OS scheme', () => {
    expect(inlineStyle).toMatch(/data-scheme=['"]?dark/)
  })

  it('theme-color follows the scheme: a light and a dark <meta> with media', () => {
    const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/g)].map((m) => m[0])
    expect(metas).toHaveLength(2)
    const dark = metas.find((m) => /prefers-color-scheme:\s*dark/.test(m))
    const light = metas.find((m) => /prefers-color-scheme:\s*light/.test(m))
    expect(light?.toLowerCase()).toContain(`content="${lightBg}"`)
    expect(dark?.toLowerCase()).toContain(`content="${darkBg}"`)
  })

  it('the inline style does not set text colour or fonts (the app owns those)', () => {
    expect(inlineStyle).not.toMatch(/font-family|(^|[;{\s])color\s*:/)
  })

  it('keeps viewport-fit=cover (the safe-area insets depend on it)', () => {
    expect(html).toMatch(/viewport-fit=cover/)
  })
})
