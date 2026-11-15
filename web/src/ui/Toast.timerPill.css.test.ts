// B9-25 (PC-04, main-session ruling 4): toasts never overlap the shell's timer pill. While the pill shows at the bottom (phones and
// tablets) app/ShellTimers.css publishes its room on the root as --timer-pill-clearance (the pill's 52 px and a 16 px gap; 0 from
// 64em, where the pill sits in the top bar), and every rule that places the toast region adds it to the region's bottom, with a 0px
// fallback so a page without the pill is unchanged. Read as text; the page-layout scenario `timer-pill` measures the pill itself.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const toast = readUiCss('Toast.css')
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const shellTimers = readFileSync(`${cwd}/src/app/ShellTimers.css`, 'utf8')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()

describe('the toast region makes room for the timer pill (PC-04)', () => {
  it('every rule that sets the region\'s bottom adds var(--timer-pill-clearance, 0px): the plain page and the sticky-bar lift', () => {
    const rules = ruleBlocks(toast).filter((r) => r.selectors.some((s) => norm(s).includes('.toast-region') && !norm(s).includes('.toast-live')))
    const bottoms = rules.map((r) => /bottom:\s*([^;]+)/.exec(r.body)?.[1]).filter(Boolean) as string[]
    expect(bottoms.length).toBeGreaterThanOrEqual(2)
    for (const b of bottoms) expect(norm(b)).toContain('var(--timer-pill-clearance, 0px)')
  })

  it('the base region keeps the bar, the keyboard and its gap besides the pill\'s room', () => {
    const b = norm(declarations(toast, '.toast-region')['bottom'] ?? '')
    expect(b).toBe('calc(var(--nav-top) + var(--keyboard-inset) + var(--timer-pill-clearance, 0px) + var(--space-3))')
  })

  it('the shell publishes the room only while the pill shows (:root:has(.shell-timer)): the pill\'s 52 px and the 16 px above it', () => {
    const m = /:root:has\(\.shell-timer\)\s*\{([^}]*)\}/.exec(shellTimers.replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(m, 'a ":root:has(.shell-timer)" rule in app/ShellTimers.css').not.toBeNull()
    expect(norm(/--timer-pill-clearance:\s*([^;]+)/.exec(m![1]!)?.[1] ?? '')).toBe('calc(52px + var(--space-4))')
  })

  it('from 64em the pill is in the top bar: the room is 0 there', () => {
    const wide = /@media \(min-width: 64em\)\s*\{\s*:root:has\(\.shell-timer\)\s*\{([^}]*)\}/.exec(shellTimers.replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(wide, 'a ":root:has(.shell-timer)" rule first in the 64em block').not.toBeNull()
    expect(norm(/--timer-pill-clearance:\s*([^;]+)/.exec(wide![1]!)?.[1] ?? '')).toBe('0px')
  })
})
