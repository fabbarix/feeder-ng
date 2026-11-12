// CRS G2: the Review Exclusions page and the Couldn't plan lines are lists the browser would bullet. Source scan, no DOM.
import { describe, expect, it } from 'vitest'
import { readFeatureCss, readSource } from './test-css'

const FILES = [
  'features/plan/components/CouldntPlanTile.tsx',
  'features/plan/components/CouldntPlanExclusionTile.tsx',
  'features/plan/components/CouldntPlanExclusionSummary.tsx',
  'features/plan/screens/CouldntPlanExclusionsScreen.tsx',
]
const css = readFeatureCss('plan.css')

/** The class of every `<ul className="...">` written in the source of the files above. */
const listClasses = FILES.flatMap((f) => [...readSource(f).matchAll(/<ul[^>]*className="([^"]+)"/g)].map((m) => m[1]!.split(/\s+/)))

function ruleFor(cls: string): string {
  return css.split('}').find((r) => new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{`).test(r) && /list-style\s*:\s*none/.test(r)) ?? ''
}

describe('the lists of the Couldn\'t plan tiles and the Review Exclusions page have no bullets', () => {
  it('the Exclusion tile writes its own lists (Who eats it, Exclusions, where this applies)', () => {
    expect(listClasses.length).toBeGreaterThanOrEqual(3)
  })

  it('every `<ul className>` of these files has a plan.css rule with list-style: none', () => {
    for (const classes of listClasses) {
      expect(classes.some((c) => ruleFor(c) !== ''), classes.join(' ')).toBe(true)
    }
  })

  it('the cell the URL hash names shows where focus is (a visible focus ring or a highlight), not the browser default alone', () => {
    expect(css).toMatch(/\[tabindex="-1"\][^{]*:focus(-visible)?[^{]*\{[^}]*(outline|box-shadow)/)
  })
})
