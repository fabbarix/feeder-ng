// B9-26 (PC-01): the changed row's bar and the "was" text. The rule may live in plan.css, a component stylesheet or a new one the
// developer adds (B9-32 reworks plan.css later); the contract is read from every stylesheet of the feature.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const fs = (await import(/* @vite-ignore */ nodeFs)) as { readdirSync: (p: string, o: { recursive: boolean }) => string[]; readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const root = `${cwd}/src/features/plan`
const css = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(`${root}/${f}`, 'utf8'))
  .join('\n')

/** The declarations of every rule whose selector mentions `needle`. */
function rulesFor(needle: string): string {
  const out: string[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) if (m[1]!.includes(needle)) out.push(m[2]!)
  return out.join('\n')
}

describe('the changed row (PC-01)', () => {
  it('[data-changed] keeps an info-tone bar on its start edge: inset 3px 0 0 var(--color-info-fg)', () => {
    expect(rulesFor('[data-changed]')).toMatch(/box-shadow:[^;]*inset\s+3px\s+0\s+0\s+var\(--color-info-fg\)/)
  })

  it('the bar uses the logical start edge or the left one only through the inset shadow, never a border (no layout shift)', () => {
    expect(rulesFor('[data-changed]')).not.toMatch(/border(-left|-inline-start)?\s*:/)
  })

  it('the "was" text is muted, on one line, and sits on the row\'s meta (the .plan-row__was rule exists)', () => {
    const was = rulesFor('.plan-row__was')
    expect(was).not.toBe('')
    expect(was).toMatch(/color:\s*var\(--color-muted\)|color:\s*var\(--color-on-surface-variant\)/)
  })
})
