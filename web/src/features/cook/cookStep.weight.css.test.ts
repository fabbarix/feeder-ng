// DS-07 (system.md 1, decisions.md: the user chose Medium): Cook Mode's Step text keeps its size and is weight 500 through
// --text-step-weight, never 800. B9-08 sweep review.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/cook/cook.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Cook Mode Step text weight', () => {
  it('the Step text is Medium: font-weight var(--text-step-weight), never bold', () => {
    expect(declarations(css, '.cook-step__text')['font-weight']).toBe('var(--text-step-weight)')
    expect(css).not.toMatch(/\.cook-step__text\s*\{[^}]*font-weight:\s*(700|800|bold)/)
  })
})
