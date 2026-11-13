// DS-A (docs/design/system.md §8): below 1024 px the page ends at least --space-6 above the floating bottom bar, and the section
// rhythm is one token. The shell's <main> carries the clearance for every Page (ui/Page sits inside it); the page-layout guard's
// rule P12 checks the rendered result at the end of a scroll.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Page } from './Page'
import { declarations, readStylesCss, readUiCss, ruleBlocks } from './test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const shell = readFileSync(`${cwd}/src/app/shell.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rootVars = ruleBlocks(shell).find((b) => b.selectors.includes(':root') && /--nav-clearance/.test(b.body))?.body ?? ''

describe('Page: bottom clearance above the nav', () => {
  it('--nav-clearance is the bar height + its inset + --space-6 + the safe area (was --space-4)', () => {
    const v = rootVars.match(/--nav-clearance:\s*([^;]+);/)?.[1] ?? ''
    expect(v).toContain('var(--nav-height)')
    expect(v).toContain('var(--nav-inset)')
    expect(v).toContain('var(--space-6)')
    expect(v).toContain('env(safe-area-inset-bottom')
    expect(v).not.toContain('var(--space-4)')
  })

  it('the shell main pads its end by --nav-clearance, so every Page ends above the bar', () => {
    expect(declarations(shell, '.app-main')['padding-bottom']).toBe('var(--nav-clearance)')
  })

  it('a Page adds no bottom margin or padding of its own that could cancel it, and does not clip its content', () => {
    const page = declarations(readUiCss('Page.css'), '.page')
    expect(page['margin-block-end'] ?? '0').toBe('0')
    expect(page['overflow'] ?? 'visible').toBe('visible')
  })

  it('the page body spaces its sections by --section-gap (= --space-6)', () => {
    expect(readStylesCss()).toMatch(/--section-gap:\s*var\(--space-6\)/)
    const body = declarations(readUiCss('Page.css'), '.page__body')
    expect(body['display']).toBe('grid')
    expect(body['gap']).toBe('var(--section-gap)')
    const { container } = render(<Page width="wide"><section>a</section><section>b</section></Page>)
    expect(container.querySelectorAll('.page__body > section')).toHaveLength(2)
  })
})
