// B9-10 review (A11Y-02, P39): two controls side by side stand at least 8 px apart, so a 3 px ring with its 2 px offset never
// touches the neighbour; the Ingredient line's drag handle has its whole 44 px column, so it never overlaps the picker.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (p: string) => readFileSync(`${cwd}/src/${p}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the first top-level rule whose selector is exactly `selector`. */
function decl(css: string, selector: string, prop: string): string | undefined {
  const m = new RegExp(`(^|\\})\\s*${selector.replace(/[.[\]()'=]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? new RegExp(`(^|;|\\s)${prop}\\s*:\\s*([^;]+)`).exec(m[2]!)?.[2]?.trim() : undefined
}

describe.each([
  ['features/recipes/recipe-editor.css', '.line-row__remove'],
  ['features/recipes/recipe-editor.css', '.step-card__moves'],
  ['features/settings/settings.css', '.allowlist__actions'],
  ['features/recipe-assistant/recipe-assistant.css', '.ra__key-actions'],
])('%s %s', (sheet, selector) => {
  it('keeps its controls 8 px apart (--space-2)', () => {
    expect(decl(read(sheet), selector, 'gap')).toBe('var(--space-2)')
  })
})

describe('the Ingredient line drag handle', () => {
  const css = read('features/recipes/recipe-editor.css')
  it('has the whole 44 px target as its column (--target-min)', () => {
    expect(decl(css, '.line-row__handle', 'inline-size')).toBe('var(--target-min)')
  })
  it('the one-row actions track holds two 40 px buttons and the 8 px gap (88 px), header and row alike', () => {
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0, 1\.4fr\) 88px 120px minmax\(0, 1fr\) 88px;/)
  })
})

describe('the saved API key row', () => {
  it('wraps Replace and Remove in .ra__key-actions', () => {
    expect(readFileSync(`${cwd}/src/features/recipe-assistant/components/ApiKeyRow.tsx`, 'utf8')).toContain('className="ra__key-actions"')
  })
})
