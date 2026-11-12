// QA follow-ups (1.0.0-beta.4.1; docs/dev/design/qa-followups.md): a toast never covers the sticky action bar, the sticky-bar page
// padding skips full-screen pages, and the comments name the tokens that are really used. CSS read as text (jsdom has no layout).
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const comments = (s: string) => (s.match(/\/\*[\s\S]*?\*\//g) ?? []).join('\n')

const toastCss = readUiCss('Toast.css')
const stickyCss = readUiCss('StickyActionBar.css')
const shellCss = readFileSync(`${cwd}/src/app/shell.css`, 'utf8')

/** The body of the first rule whose selector list matches `sel` (regex), at the top level of the stripped CSS. */
function ruleBody(css: string, sel: RegExp): string {
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (sel.test(m[1]!.trim())) return m[2]!
  return ''
}

describe('FU-1: a toast never covers the sticky action bar', () => {
  it('without a sticky bar the toast region sits above the bottom bar top edge (--nav-top) plus a gap, not --nav-clearance', () => {
    const bottom = declarations(toastCss, '.toast-region')['bottom'] ?? ''
    expect(bottom).toMatch(/var\(--nav-top\)/)
    expect(bottom).not.toMatch(/--nav-clearance/)
    expect(bottom).toMatch(/\+\s*var\(--space-\d+\)/)
  })
  it('with a sticky bar on the page the region is lifted by the bar height (--sticky-bar-clearance) as well', () => {
    const body = ruleBody(toastCss, /^(html|body|:root):has\(\s*\.sticky-action-bar\s*\)\s+\.toast-region$/)
    expect(body, 'a rule "html:has(.sticky-action-bar) .toast-region" in Toast.css').not.toBe('')
    const bottom = /(?:^|;|\s)bottom:\s*([^;]+)/.exec(body)?.[1] ?? ''
    expect(bottom).toMatch(/var\(--nav-top\)/)
    expect(bottom).toMatch(/var\(--sticky-bar-clearance\)/)
    expect(bottom).toMatch(/var\(--space-\d+\)/)
  })
  it('--sticky-bar-clearance is defined (StickyActionBar.css :root) and the toast stays above the bar in z-order', () => {
    expect(declarations(stickyCss, ':root')['--sticky-bar-clearance']).toMatch(/^\d+px$/)
    expect(Number(declarations(toastCss, '.toast-region')['z-index'])).toBeGreaterThan(Number(declarations(stickyCss, '.sticky-action-bar')['z-index']))
  })
})

describe('FU-2: the sticky-bar page padding skips full-screen pages', () => {
  it('.app-main:has(.sticky-action-bar) is limited with :not(.app-main--full)', () => {
    const css = strip(stickyCss)
    expect(css).toMatch(/\.app-main:has\(\s*\.sticky-action-bar\s*\):not\(\s*\.app-main--full\s*\)\s*\{[^}]*padding-bottom:\s*var\(--nav-top\)/)
    expect(css).not.toMatch(/\.app-main:has\(\s*\.sticky-action-bar\s*\)\s*\{/)
  })
  it('the full-screen class named is the one the shell really sets', () => {
    expect(strip(shellCss)).toMatch(/\.app-main--full\s*\{/)
    expect(readFileSync(`${cwd}/src/app/AppShell.tsx`, 'utf8')).toMatch(/app-main app-main--full/)
  })
})

describe('FU-3: comments name the tokens that are used (--nav-clearance stays: it pads .app-main; --nav-top places bars and toasts)', () => {
  it('--nav-clearance is still a real, used token', () => {
    expect(strip(shellCss)).toMatch(/padding-bottom:\s*var\(--nav-clearance\)/)
  })
  it('Toast.css header comment says --nav-top, and no longer says the toast sits above --nav-clearance', () => {
    const c = comments(toastCss)
    expect(c).toMatch(/--nav-top/)
    expect(c).not.toMatch(/--nav-clearance/)
  })
  it('StickyActionBar.css header comment says --nav-top (zero from 1024), not --nav-clearance', () => {
    const header = (/^\s*\/\*[\s\S]*?\*\//.exec(stickyCss)?.[0] ?? '')
    expect(header).toMatch(/--nav-top/)
    expect(header).not.toMatch(/--nav-clearance/)
  })
})
