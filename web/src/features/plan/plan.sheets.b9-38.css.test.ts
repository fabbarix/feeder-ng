// B9-38 (PC-09, PC-10, SHORT-02): the stylesheet contracts of the Plan's sheets. Tokens only; the old stacked footer is gone.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss, readSource } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('the footers are FormActions rows, not a column of full-width buttons', () => {
  it('plan.css has no `.plan-sheet__actions` rule', () => {
    expect(css).not.toMatch(/\.plan-sheet__actions/)
  })

  it.each(['PlannedMealSheet', 'MarkCookedSheet', 'MarkAllCookedSheet'])('%s builds its footer with FormActions and no `plan-sheet__actions` wrapper', (name) => {
    const src = readSource(`features/plan/components/${name}.tsx`)
    expect(src).toContain('FormActions')
    expect(src).not.toContain('plan-sheet__actions')
  })
})

describe("a Cooked meal's Leftover block (PC-09)", () => {
  it('is in the leftover tone, from the status tokens', () => {
    const d = declarations(css, '.plan-sheet__leftover')
    expect(d['background']).toBe('var(--status-leftover-bg)')
    expect(d['color']).toBe('var(--status-leftover-fg)')
    expect(d['border-radius']).toMatch(/^var\(--radius-/)
  })
})

describe('Swap and Choose a Recipe rows (PC-10)', () => {
  it('the chips under a row line up with the text column, not under the picture', () => {
    const blocks = ruleBlocks(css).filter((b) => b.selectors.some((s) => /\.plan-sheet__rows\b.*\.list-row__below/.test(s)))
    expect(blocks.length, 'a `.plan-sheet__rows … .list-row__below` rule').toBeGreaterThan(0)
    const body = blocks.map((b) => b.body).join(';')
    expect(body).toMatch(/(padding|margin)-inline-start\s*:[^;]*48px/) // the 48 px thumb
    expect(body).toMatch(/var\(--space-\d\)/) // and its gap
  })

  it('Swap and Choose put their rows in `.plan-sheet__rows`', () => {
    for (const name of ['SwapSheet', 'RecipeChooserSheet']) expect(readSource(`features/plan/components/${name}.tsx`), name).toContain('plan-sheet__rows')
  })
})

describe('words and dates in the sheets', () => {
  it.each(['PlannedMealSheet', 'SwapSheet', 'RecipeChooserSheet', 'SlotDateSheets'])('%s prints no raw date (the context line words every day)', (name) => {
    const src = readSource(`features/plan/components/${name}.tsx`)
    expect(src).not.toMatch(/\{\s*(slot|meal)\??\.date\s*\}/)
  })

  it('"Swap for…" is gone from the strings, and Choose a Recipe no longer prints raw minutes', () => {
    expect(readSource('features/plan/strings/sheets.ts')).not.toContain('Swap for…')
    expect(readSource('features/plan/components/RecipeChooserSheet.tsx')).not.toMatch(/s\.minutes\(/)
  })
})
