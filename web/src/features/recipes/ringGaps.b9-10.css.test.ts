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
  // B9-37: the line and the Step card styles moved to their own sheets; the Step's ⋮ and trash are in .step-card__actions.
  ['features/recipes/recipe-editor.lines.css', '.line-row__remove'],
  ['features/recipes/recipe-editor.steps.css', '.step-card__actions'],
  ['features/settings/settings.css', '.allowlist__actions'],
  ['features/recipe-assistant/recipe-assistant.css', '.ra__key-actions'],
])('%s %s', (sheet, selector) => {
  it('keeps its controls 8 px apart (--space-2)', () => {
    expect(decl(read(sheet), selector, 'gap')).toBe('var(--space-2)')
  })
})

// B9-37 (RX-02): the handle has the chapter's 32 px track of its own (the first of the one-row tracks), so it never overlaps the picker:
// its holder is exactly that wide, and the Ingredient cell's gap equals the column gap, so the picker starts on the Ingredient track.
describe('the Ingredient line drag handle', () => {
  const css = read('features/recipes/recipe-editor.lines.css')
  it('has its own 32 px column, the first track, and its holder is that wide', () => {
    expect(decl(css, '.line-row__handle', 'inline-size')).toBe('32px')
    expect(css).toMatch(/grid-template-columns:\s*32px minmax\(9rem, 1\.6fr\) 88px 112px minmax\(6rem, 1fr\) 64px 88px;/)
    expect(decl(css, '.line-row__ingredient', 'gap')).toBe('var(--space-2)')
  })
  it('the one-row actions track holds two 40 px buttons and the 8 px gap (88 px), header and row alike', () => {
    expect(css).toMatch(/grid-template-columns:[^;]* 64px 88px;/)
  })
})

describe('the saved API key row', () => {
  it('wraps Replace and Remove in .ra__key-actions', () => {
    expect(readFileSync(`${cwd}/src/features/recipe-assistant/components/ApiKeyRow.tsx`, 'utf8')).toContain('className="ra__key-actions"')
  })
})
