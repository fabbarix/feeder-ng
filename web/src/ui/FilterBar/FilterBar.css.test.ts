// The CSS contract of the shared filter header (docs/design/recipes-filter.md 3, 13, 14; pantry-filter.md 3, 5). jsdom does not
// lay out: the rows and the chip line are pinned here and checked in a browser by the page-layout guard (P16 to P21).
import { describe, expect, it } from 'vitest'
import { cssRules } from '../../test/cssRules'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }

const { rules, valueFor } = cssRules(['ui/FilterBar/FilterBar.css'])
const WIDTHS = [0, 390, 768, 1280, 1920]

describe('the rows', () => {
  it.each(['.filter-bar__row', '.filter-chips'])('%s is one flex line at every width', (sel) => {
    for (const w of WIDTHS) {
      expect(valueFor(sel, 'display', w), `${sel} @${w}`).toBe('flex')
      expect(valueFor(sel, 'flex-wrap', w), `${sel} @${w}`).toBe('nowrap')
      expect(valueFor(sel, 'min-inline-size', w), `${sel} @${w}`).toBe('0')
    }
  })
  it('a header outside a ListPage stacks its rows one slot gap (the ListPage gap) apart', () => {
    expect(valueFor('.filter-bar', 'display', 0)).toBe('grid')
    expect(valueFor('.filter-bar', 'gap', 0)).toBe('var(--space-4)')
    expect(valueFor('.filter-bar', 'grid-template-columns', 0)).toBe('minmax(0, 1fr)')
  })
})

// pantry-filter review (the user's decision): on a narrow header the Sort chip has no leading sort icon, on the Recipes and the Pantry
// headers alike, so "Good until" fits at 360 px; on a wider one the icon is back. B9-07 (DS-09): the threshold is the header's own
// width, a component-fit container query in rem (`@container (width < 24rem)` on the FilterBar, the chapter's table), no longer a
// window width (it was max-width: 419px). At 16 px text and a 16 px gutter that is a window under about 416 px.
const sortRule = /@container\s+filter-bar\s*\(\s*width\s*<\s*24rem\s*\)\s*\{\s*\.filter-bar__sort \.select__leading\s*\{\s*display:\s*none;?\s*\}\s*\}/
const source = readFileSync(`${(globalThis as unknown as { process: { cwd: () => string } }).process.cwd()}/src/ui/FilterBar/FilterBar.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
describe('row 2: the Sort chip on a narrow header', () => {
  it('the header is the inline-size container named filter-bar', () => {
    expect(valueFor('.filter-bar', 'container', 0)).toBe('filter-bar / inline-size')
  })
  it('under 24 rem of header the Sort chip hides its leading icon (a container query in rem)', () => {
    expect(source).toMatch(sortRule)
  })
  it.each([360, 390, 419, 420, 768, 1440])('no window-width rule hides it (at %i px the media rules keep it)', (w) => {
    expect(valueFor('.filter-bar__sort .select__leading', 'display', w)).toBeUndefined()
  })
  it('only the Sort chip of a filter header: no other Select loses its leading visual', () => {
    expect([...source.matchAll(/([^{}]*select__leading[^{}]*)\{/g)].map((m) => m[1]!.trim())).toEqual(['.filter-bar__sort .select__leading'])
  })
})

describe('a line of toggle chips in the panel', () => {
  it('is one line that scrolls sideways, its chips at their natural width', () => {
    expect(valueFor('.filter-chip-group', 'flex-wrap', 0)).toBe('nowrap')
    expect(valueFor('.filter-chip-group', 'overflow-x', 0)).toBe('auto')
    expect(valueFor('.filter-chip-group > .chip', 'flex', 0)).toBe('none')
  })
  it('is padded for the focus ring, with a matching negative margin, and ends in a spacer', () => {
    expect(valueFor('.filter-chip-group', 'padding', 0)).toBe('var(--space-2)')
    expect(valueFor('.filter-chip-group', 'margin-inline', 0)).toBe('calc(-1 * var(--space-2))')
    expect(valueFor('.filter-chip-group::after', 'inline-size', 0)).toBe('var(--space-2)')
  })
})

describe('the panel', () => {
  it('a long list scrolls inside a capped height', () => {
    expect(valueFor(".filter-panel__list [role='listbox']", 'overflow-y', 0)).toBe('auto')
    expect(valueFor(".filter-panel__list [role='listbox']", 'max-block-size', 0)).toBeDefined()
  })
})

describe('tokens only', () => {
  it('no colour literal and no raw font size', () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      expect(r.body, r.selector).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i)
      expect(r.body, r.selector).not.toMatch(/font-size:\s*(?!var\(--text-)\S/)
    }
  })
})
