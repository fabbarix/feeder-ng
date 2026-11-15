// B9-49 (RES-08): index.html paints the returning User's theme before the first frame and draws a shell skeleton, from the cache the
// settings feature wrote (theme/themeCache: localStorage `feeder.theme`). Mock: docs/design/ui-review-3/mocks/res-08-boot-shell.html.
// index.html links no app.css (none has loaded yet): everything is inline, and the inline script is under 1 KB.
import { describe, expect, it } from 'vitest'
import { buildThemeCache, writeThemeCache } from './theme/themeCache'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const html = readFileSync(`${cwd}/index.html`, 'utf8')

const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!)
const bootScript = scripts.find((s) => s.includes('feeder.theme')) ?? ''
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join('\n')

describe('the inline boot script', () => {
  it('exists, reads only localStorage "feeder.theme" and the document, and is under 1 KB', () => {
    expect(bootScript).not.toBe('')
    expect(new TextEncoder().encode(bootScript).length).toBeLessThan(1024)
    expect(bootScript).not.toMatch(/\b(fetch|XMLHttpRequest|import|require|eval|sessionStorage|indexedDB)\b/)
    expect(bootScript).toMatch(/localStorage\.getItem\(\s*['"]feeder\.theme['"]\s*\)/)
  })

  it('sets data-scheme, the six --boot-* variables, theme-color and data-boot="shell", and does nothing without a cache (try/catch)', () => {
    expect(bootScript).toMatch(/dataset\.scheme|setAttribute\(\s*['"]data-scheme['"]/)
    for (const v of ['--boot-bg', '--boot-surface', '--boot-surface-2', '--boot-line', '--boot-text', '--boot-accent']) expect(bootScript, v).toContain(v)
    expect(bootScript).toMatch(/theme-color/)
    expect(bootScript).toMatch(/data-boot|dataset\.boot/)
    expect(bootScript).toMatch(/try\s*\{[\s\S]*catch/)
  })

  it('runs before the stylesheet and the body: it sits in <head>, ahead of the first <style>', () => {
    const head = /<head>([\s\S]*?)<\/head>/i.exec(html)![1]!
    expect(head).toContain('feeder.theme')
    expect(head.indexOf('feeder.theme')).toBeLessThan(head.search(/<style/i))
  })

  it('runs for real: with a cached dark theme it sets the scheme, the variables, the meta colour and the shell boot flag; with none, nothing', () => {
    const cache = buildThemeCache({ scheme: 'dark', accent: '#d9503f' })
    localStorage.clear()
    document.documentElement.removeAttribute('data-scheme')
    document.documentElement.removeAttribute('data-boot')
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = '<meta name="theme-color" content="#e7f4eb">'
    new Function(bootScript)() // no cache yet
    expect(document.documentElement.dataset.boot).toBeUndefined()
    writeThemeCache(cache)
    new Function(bootScript)()
    const root = document.documentElement
    expect(root.dataset.scheme).toBe('dark')
    expect(root.dataset.boot).toBe('shell')
    expect(root.style.getPropertyValue('--boot-bg')).toBe(cache.dark.bg)
    expect(root.style.getPropertyValue('--boot-surface')).toBe(cache.dark.surface)
    expect(root.style.getPropertyValue('--boot-surface-2')).toBe(cache.dark.surface2)
    expect(root.style.getPropertyValue('--boot-line')).toBe(cache.dark.line)
    expect(root.style.getPropertyValue('--boot-text')).toBe(cache.dark.text)
    expect(root.style.getPropertyValue('--boot-accent')).toBe(cache.dark.accent)
    expect(document.querySelector('meta[name=theme-color]')!.getAttribute('content')).toBe(cache.dark.bg)
  })

  it('a malformed cache is ignored, never thrown', () => {
    localStorage.setItem('feeder.theme', '{"scheme":"dark","dark":{"bg":"url(x)"}}')
    document.documentElement.removeAttribute('data-boot')
    expect(() => new Function(bootScript)()).not.toThrow()
    expect(document.documentElement.dataset.boot).toBeUndefined()
  })
})

describe('the shell skeleton in index.html', () => {
  it('is a role="status" named "Opening Feeder" inside #root, its blocks aria-hidden (the brand is text, not announced twice)', () => {
    expect(html).toMatch(/<div[^>]*class="boot-shell"[^>]*role="status"[^>]*aria-label="Opening Feeder"|<div[^>]*role="status"[^>]*class="boot-shell"[^>]*aria-label="Opening Feeder"|<div[^>]*aria-label="Opening Feeder"[^>]*>/)
    const shell = /<div[^>]*class="boot-shell"[\s\S]*?<\/div>\s*<\/div>\s*(?=<script|<\/body)/.exec(html)?.[0] ?? ''
    expect(shell).toMatch(/boot-shell__page"[^>]*aria-hidden="true"/)
    expect(shell).toMatch(/boot-shell__rail"[^>]*aria-hidden="true"/)
    expect(shell).toMatch(/boot-shell__bar"[^>]*aria-hidden="true"/)
  })

  it('draws the top bar, seven rail pills, a title pill, two tiles and the bottom bar outline', () => {
    for (const c of ['boot-shell__top', 'boot-shell__brand', 'boot-shell__avatar', 'boot-shell__rail', 'boot-shell__page', 'boot-shell__title', 'boot-shell__tile', 'boot-shell__bar']) {
      expect(html, c).toContain(c)
    }
    expect(/class="boot-shell__rail"[^>]*>((?:<span><\/span>){7})<\/div>/.test(html)).toBe(true)
    expect([...html.matchAll(/class="boot-shell__tile"/g)]).toHaveLength(2)
  })

  it('shows only for a returning User: hidden by default, the centred mark hidden when data-boot="shell"', () => {
    expect(styles).toMatch(/\.boot-shell\s*\{\s*display:\s*none/)
    expect(styles).toMatch(/html\[data-boot=['"]shell['"]\]\s+\.boot-mark\s*\{\s*display:\s*none/)
    expect(styles).toMatch(/html\[data-boot=['"]shell['"]\]\s+\.boot-shell\s*\{[^}]*display:\s*grid/)
  })

  it('paints with the --boot-* colours, falling back to the default boot colours when there is no cache', () => {
    expect(styles).toMatch(/background:\s*var\(--boot-bg,\s*#[0-9a-f]{6}\)/i)
    expect(styles).toMatch(/var\(--boot-surface-2\)/)
    expect(styles).toMatch(/var\(--boot-accent/)
  })

  it('has the phone bar and the 88 px rail of the shell: the bar from 0 to 1023 px, seven 56 px rail pills from 1024 px', () => {
    expect(styles).toMatch(/\.boot-shell__bar\s*\{[^}]*height:\s*70px[^}]*border-radius:\s*24px/)
    expect(styles).toMatch(/@media\s*\(min-width:\s*1024px\)/)
    expect(styles).toMatch(/\.boot-shell__rail\s+span\s*\{[^}]*width:\s*56px;\s*height:\s*56px/)
  })

  it('pulses at 1.6 s, and not at all under reduced motion', () => {
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^}]*animation:\s*boot-pulse\s+1\.6s/)
    expect(styles.replace(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^}]*\}\s*\}/, '')).not.toMatch(/animation:/)
  })

  it('keeps the centred mark for a first visit (no cache)', () => {
    expect(html).toContain('class="boot-mark"')
  })
})
