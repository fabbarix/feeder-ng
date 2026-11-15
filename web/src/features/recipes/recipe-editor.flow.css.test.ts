// B9-37 (RX-02, RX-10): the editor's layout contract in the source (jsdom does not lay out; the real measures are the page-layout scenarios
// recipe-editor-flow and recipe-new-flow). The editor stylesheets may be split (recipe-editor.lines.css, .steps.css, .sections.css); each
// stays under 600 lines (sweep.b9-10.css.test.ts holds the cap for every sheet, this file names the editor's).
import { describe, expect, it } from 'vitest'
import { cssRules } from './rules.test-helper'
import { recipesCssPaths, readRecipesCss } from './recipesCss.test-helper'
import { readSource } from '../plan/test-css'

const editorPaths = recipesCssPaths().filter((p) => /recipe-editor[^/]*\.css$/.test(p))
const all = cssRules(recipesCssPaths())
const text = readRecipesCss().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
const TRACKS = '32px minmax(9rem, 1.6fr) 88px 112px minmax(6rem, 1fr) 64px 88px'

describe('an Ingredient line is one row from 42 rem of list width (RX-02)', () => {
  it('the lines box is the container "rx-lines" (inline-size), and it is the only thing the line layout asks about', () => {
    expect(text).toMatch(/\.recipe-editor__lines-box \{[^}]*container(?:-name)?:\s*rx-lines/)
    expect(text).toMatch(/\.recipe-editor__lines-box \{[^}]*container(?:-type:\s*|:[^;}]*\/\s*)inline-size/)
    expect(text).toContain('@container rx-lines (min-width: 42rem)')
  })

  it('the 49 rem container "editor-lines" and every 900 px media query are gone', () => {
    expect(text).not.toContain('editor-lines')
    expect(text).not.toContain('49rem')
    expect(text).not.toMatch(/@media[^{]*900px/)
  })

  it('the row and the captions above it share one set of tracks: handle, Ingredient, Quantity, Unit, Note, Optional, actions', () => {
    expect(all.valueAt('.line-row', 'grid-template-columns', 672)).toBe(TRACKS)
    expect(all.valueAt('.recipe-editor__lines-head', 'grid-template-columns', 672)).toBe(TRACKS)
  })

  it('the captions row takes the same gap and side padding as a row, so a caption sits over its field and "INGREDIENT" never sits over the handle', () => {
    const gap = (sel: string) => all.valueAt(sel, 'gap', 672) ?? all.valueAt(sel, 'column-gap', 672)
    expect(gap('.recipe-editor__lines-head')).toBeDefined()
    expect(gap('.recipe-editor__lines-head')).toBe(gap('.line-row'))
    expect(all.valueAt('.recipe-editor__lines-head', 'padding-inline', 672)).toBe(all.valueAt('.line-row', 'padding-inline', 672))
  })

  it('below 42 rem the captions are not drawn', () => {
    expect(all.valueAt('.recipe-editor__lines-head', 'display', 0) ?? 'none').toBe('none')
  })
})

describe('the editor stylesheets stay under the 600-line cap', () => {
  it('there is at least recipe-editor.css, and none passes 600 lines', () => {
    expect(editorPaths.length).toBeGreaterThan(0)
    for (const p of editorPaths) expect(readSource(p).split('\n').length, p).toBeLessThanOrEqual(600)
  })
})

describe('the Step kind never wraps (P30) and the Step card is compact', () => {
  it('a Segmented option is one line wherever it is used in the editor', () => {
    const seg = cssRules(['ui/fields/Segmented.css'])
    const body = seg.rulesFor('.segmented__option').map((r) => r.body).join(';')
    expect(body).toMatch(/white-space:\s*nowrap/)
  })
})
