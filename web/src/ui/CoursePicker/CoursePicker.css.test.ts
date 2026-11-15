// SET-09: the Course row is a grid driven by the container's width, never the viewport's. Three places share it: the Meal Slot editor,
// Change a date and the Recipe editor. The row has its own boundary, so a focused ↑ ↓ × draws its ring inside it (R-C+).
import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

const css = readUiCss('CoursePicker/CoursePicker.css').replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ')
function body(selector: string): string {
  const flat = css.replace(/@[a-z-]+[^{;]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const out: string[] = []
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1]!.split(',').map((x) => norm(x).trim()).includes(selector)) out.push(norm(m[2]!))
  return out.join(' ')
}
function containerBlock(query: string): string {
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

describe('CoursePicker.css: the row grid', () => {
  it('the list is an inline-size container', () => {
    expect(body('.course-picker__list')).toMatch(/container(-type)?:\s*([\w-]+ \/ )?inline-size/)
  })
  it('a row is the grid 44px minmax(0, 1fr) auto with the areas handle/text/actions over extras', () => {
    const b = body('.course-picker__row')
    expect(b).toMatch(/display:\s*grid/)
    expect(b).toMatch(/grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto/)
    expect(b).toMatch(/grid-template-areas:\s*'handle text actions' '\. extras extras'/)
  })
  it('each part sits in its own area, so the buttons align at the same x in every row', () => {
    expect(body('.course-picker__text')).toMatch(/grid-area:\s*text/)
    expect(body('.course-picker__actions')).toMatch(/grid-area:\s*actions/)
    expect(body('.course-picker__extras')).toMatch(/grid-area:\s*extras/)
  })
  it('below 26 rem of list width the extras stack in one column', () => {
    expect(containerBlock('max-width:\\s*26rem')).toMatch(/\.course-picker__extras\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })
  it('there is no viewport media query for the row any more', () => {
    expect(css).not.toMatch(/@media\s*\(width\s*<\s*48em\)/)
    expect(css).not.toMatch(/@media[^{]*\{[^}]*\.course-picker__(row|extras)/)
  })
  it('the meta line is one muted line that ends in an ellipsis', () => {
    const b = body('.course-picker__meta')
    expect(b).toMatch(/color:\s*var\(--color-muted\)/)
    expect(b).toMatch(/text-overflow:\s*ellipsis/)
    expect(b).toMatch(/white-space:\s*nowrap/)
  })
})

describe('CoursePicker.css: the row boundary and its focus (R-C+)', () => {
  it('the row has a 1 px --color-line boundary of its own', () => {
    expect(body('.course-picker__row')).toMatch(/border:\s*1px solid var\(--color-line\)/)
  })
  it('while a child has focus the boundary steps back to --color-outline, so the inner ring is the only accent', () => {
    expect(body('.course-picker__row:has(:focus-visible)')).toMatch(/border-color:\s*var\(--color-outline\)/)
  })
  it('a focused control inside the row draws its ring inside itself (negative offset) on a soft fill', () => {
    const b = body('.course-picker__row :focus-visible') + ' ' + body('.course-picker__actions :focus-visible')
    // The inner ring by its tokens (focusLayer.css.test.ts allows no literal px): -2 px, inside the control.
    expect(b).toMatch(/outline-offset:\s*(-2px|calc\(-1 \* var\(--focus-ring-inner-width\)\))/)
    expect(b).toMatch(/background:\s*var\(--color-soft\)/)
  })
})
