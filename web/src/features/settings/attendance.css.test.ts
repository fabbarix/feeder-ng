// SET-10: the Attendance rows' CSS contract (settings.css, the `.attendance*` rules only). The grid answers to the list's width, not the viewport's.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/settings/settings.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ')

function body(selector: string): string {
  const flat = css.replace(/@[a-z-]+[^{;]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const out: string[] = []
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1]!.split(',').map((x) => norm(x).trim()).includes(selector)) out.push(norm(m[2]!))
  return out.join(' ')
}
const containerBlock = (query: string) => {
  const i = css.search(new RegExp(`@container\\s*\\(${query}\\)`))
  if (i < 0) return ''
  let depth = 0
  const start = css.indexOf('{', i)
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++
    if (css[j] === '}' && --depth === 0) return norm(css.slice(start + 1, j))
  }
  return ''
}

describe('settings.css: .attendance rows (SET-10)', () => {
  it('the list is an inline-size container', () => {
    expect(body('.attendance')).toMatch(/container(-type)?:\s*([\w-]+ \/ )?inline-size/)
  })
  it('a row is the grid 44px 40px minmax(0, 1fr) auto: checkbox, Avatar, name, stepper', () => {
    expect(body('.attendance__row')).toMatch(/grid-template-columns:\s*44px 40px minmax\(0,\s*1fr\) auto/)
  })
  it('a row is at least the row minimum high', () => {
    expect(body('.attendance__row')).toMatch(/min-block-size:\s*var\(--row-min/)
  })
  it('the name is clamped to two lines and ends in an ellipsis, so a one-word name cannot widen the row', () => {
    const b = body('.attendance__name')
    expect(b).toMatch(/-webkit-line-clamp:\s*2/)
    expect(b).toMatch(/overflow:\s*hidden/)
    expect(b).toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-word|text-overflow:\s*ellipsis/)
    expect(b).toMatch(/min-inline-size:\s*0/)
  })
  it('below 20 rem of list width every row puts its stepper under the name (all rows switch together)', () => {
    const b = containerBlock('max-width:\\s*20rem')
    expect(b).toMatch(/\.attendance__row\s*\{[^}]*grid-template-areas:\s*'check av name name' '\. \. step step'/)
    expect(b).toMatch(/\.attendance__step[^}]*justify-self:\s*start/)
  })
  it('"Not eating" is muted meta text at the end', () => {
    const b = body('.attendance__off')
    expect(b).toMatch(/color:\s*var\(--color-muted\)/)
    expect(b).toMatch(/justify-self:\s*end/)
  })
  it('the old wrapping flex row is gone', () => {
    expect(body('.attendance__row')).not.toMatch(/display:\s*flex/)
    expect(body('.attendance__row')).not.toMatch(/flex-wrap/)
  })
})
