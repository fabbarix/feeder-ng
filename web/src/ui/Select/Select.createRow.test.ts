import { describe, expect, it } from 'vitest'

// vitest blanks CSS modules and @types/node is not installed: read the source with an untyped dynamic import of node:fs.
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/

// R14b: the disabled create row dims only its label; the reason keeps the muted colour at full opacity (>= 4.5:1).
const css = readFileSync(`${cwd}/src/ui/Select/Select.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** The declarations of every rule whose selector list contains `selector`. */
const rule = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1]!.split(',').some((sel) => sel.trim() === selector))
    .map((m) => m[2]!)
    .join('\n')

describe('Select.css: disabled create row', () => {
  it('does not dim the whole disabled option', () => {
    expect(rule(".select__option--create[aria-disabled='true']")).not.toMatch(/opacity/)
    expect(rule(".select__option:not(.select__option--create)[aria-disabled='true']")).toMatch(/opacity/)
  })
  it('dims the label only, never the meta reason', () => {
    expect(rule(".select__option--create[aria-disabled='true'] .select__label")).toMatch(/opacity/)
    expect(rule(".select__option--create[aria-disabled='true'] .select__meta")).not.toMatch(/opacity/)
  })
})
