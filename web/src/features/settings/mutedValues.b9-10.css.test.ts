// B9-10 review (DS-07): Muted (13/18, the meta role) is for helper and hint lines. A value a person reads as data, a Member's
// Portion Factor ("×1") and the Recipe Assistant test's latency ("1.2 s"), stays at body size in the muted colour.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (p: string) => readFileSync(`${cwd}/src/${p}`, 'utf8')

function body(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = new RegExp(`(^|\\})\\s*${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(clean)
  return m?.[2] ?? ''
}

describe.each([
  ['settings__portion-factor', 'features/settings/settings.css', 'features/settings/components/MemberList.tsx'],
  ['ra__latency', 'features/recipe-assistant/recipe-assistant.css', 'features/recipe-assistant/components/TestResultTile.tsx'],
])('.%s is a value: body size in the muted colour', (cls, sheet, component) => {
  it('the component draws it with that class, not with Muted', () => {
    const src = read(component)
    expect(src).toContain(`className="${cls}"`)
    expect(src).not.toMatch(new RegExp(`<Muted[^>]*>\\{(text\\.portionFactor|seconds)\\(`))
  })
  it('the rule sets the body role and --color-muted, no opacity', () => {
    const b = body(read(sheet), `.${cls}`)
    expect(b).toMatch(/font-size:\s*var\(--text-body-size\)/)
    expect(b).toMatch(/line-height:\s*var\(--text-body-line\)/)
    expect(b).toMatch(/color:\s*var\(--color-muted\)/)
    expect(b).not.toMatch(/opacity/)
  })
})
